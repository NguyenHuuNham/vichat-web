"""Render the production-only Tinode root account bootstrap file."""

import argparse
import json
import os
import tempfile


PLACEHOLDERS = {
    "__TINODE_ADMIN_USERNAME__": "TINODE_ADMIN_USERNAME",
    "__TINODE_ADMIN_PASSWORD__": "TINODE_ADMIN_PASSWORD",
    "__TINODE_ADMIN_EMAIL__": "CHATMGT_BOOTSTRAP_ADMIN_EMAIL",
    "__TINODE_ADMIN_FULL_NAME__": "CHATMGT_BOOTSTRAP_ADMIN_FULL_NAME",
}


def required_env(name):
    value = str(os.getenv(name) or "").strip()
    if not value or value.startswith("replace-with-"):
        raise ValueError("{} is required.".format(name))
    return value


def replace_placeholders(value, replacements):
    if isinstance(value, dict):
        return {key: replace_placeholders(item, replacements) for key, item in value.items()}
    if isinstance(value, list):
        return [replace_placeholders(item, replacements) for item in value]
    if isinstance(value, str) and value in replacements:
        return replacements[value]
    return value


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--template",
        default="/app/deploy/tinode-bootstrap.template.json",
    )
    parser.add_argument(
        "--output",
        default="/app/deploy/runtime/tinode-bootstrap.json",
    )
    args = parser.parse_args()

    replacements = {
        placeholder: required_env(env_name)
        for placeholder, env_name in PLACEHOLDERS.items()
    }
    password = replacements["__TINODE_ADMIN_PASSWORD__"]
    if len(password) < 12:
        raise ValueError("TINODE_ADMIN_PASSWORD must contain at least 12 characters.")
    if len(password.encode("utf-8")) > 72:
        raise ValueError("TINODE_ADMIN_PASSWORD must not exceed 72 UTF-8 bytes.")

    with open(args.template, "r", encoding="utf-8") as handle:
        payload = replace_placeholders(json.load(handle), replacements)

    serialized = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    unresolved = [item for item in PLACEHOLDERS if item in serialized]
    if unresolved:
        raise ValueError("Tinode bootstrap template still contains placeholders.")

    output_dir = os.path.dirname(os.path.abspath(args.output))
    os.makedirs(output_dir, mode=0o700, exist_ok=True)
    descriptor, temporary_path = tempfile.mkstemp(prefix=".tinode-bootstrap-", dir=output_dir)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            handle.write(serialized)
        os.chmod(temporary_path, 0o600)
        os.replace(temporary_path, args.output)
    finally:
        if os.path.exists(temporary_path):
            os.unlink(temporary_path)

    print("Rendered the private Tinode bootstrap file.")


if __name__ == "__main__":
    main()
