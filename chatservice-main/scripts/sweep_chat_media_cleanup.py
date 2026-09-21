"""Run bounded, idempotent cleanup for unbound S3 media objects.

Deployments can invoke this script from cron or a one-shot worker. Bound media
is never selected by the service, so rerunning the job is safe.
"""

import argparse
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from application.server import app
from application.services.chat_media_service import sweep_media_cleanup


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=100)
    args = parser.parse_args()
    result = sweep_media_cleanup(app, limit=args.limit)
    print(
        "media cleanup: chat cleaned={chat_cleaned} retried={chat_retried}; "
        "cloud cleaned={cloud_cleaned} retried={cloud_retried}".format(
            chat_cleaned=result["chat"]["cleaned"],
            chat_retried=result["chat"]["retried"],
            cloud_cleaned=result["cloud"]["cleaned"],
            cloud_retried=result["cloud"]["retried"],
        )
    )


if __name__ == "__main__":
    main()
