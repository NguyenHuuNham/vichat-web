import json
import sys
import threading
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen


PROJECT_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = PROJECT_ROOT.parent
sys.path.insert(0, str(REPOSITORY_ROOT / "scripts"))

import local_vichat_ai_api as local_api  # noqa: E402


class LocalVichatAiApiTests(unittest.TestCase):
    def test_question_aliases_are_accepted(self):
        self.assertEqual(local_api.extract_question({"question": " one "}), "one")
        self.assertEqual(local_api.extract_question({"query": "two"}), "two")
        self.assertEqual(local_api.extract_question({"message": "three"}), "three")
        self.assertEqual(local_api.extract_question({"prompt": "four"}), "four")

    def test_sources_are_bounded_and_normalized(self):
        sources = local_api.normalize_sources({
            "sources": [{
                "relative_path": "hr/policy.pdf",
                "snippet": "  Noi dung noi bo  ",
                "score": 0.91,
            }],
        })
        self.assertEqual(sources[0]["title"], "policy.pdf")
        self.assertEqual(sources[0]["snippet"], "Noi dung noi bo")
        self.assertEqual(sources[0]["score"], 0.91)

    def test_answer_parser_accepts_provider_shapes(self):
        self.assertEqual(local_api.extract_answer({"answer": "one"}), "one")
        self.assertEqual(
            local_api.extract_answer({"choices": [{"message": {"content": "two"}}]}),
            "two",
        )
        self.assertEqual(local_api.extract_answer({"data": {"reply": "three"}}), "three")

    def test_engine_combines_retrieval_with_local_generation(self):
        engine = local_api.LocalAnswerEngine({
            "knowledge_url": "unused",
            "knowledge_key": "key",
            "knowledge_header": "X-API-Key",
            "knowledge_scheme": "",
            "llm_url": "unused",
            "llm_key": "",
            "llm_model": "local",
            "llm_format": "ollama",
            "top_k": 5,
            "timeout": 5,
            "mock": True,
        })
        engine._retrieve = lambda _question: {
            "sources": [{"title": "policy.txt", "snippet": "Noi dung."}],
        }
        result = engine.answer("Hoi gi?", history=[])
        self.assertEqual(result["answer"], result["reply"])
        self.assertTrue(result["grounded"])
        self.assertEqual(len(result["sources"]), 1)

    def test_engine_calls_knowledge_then_local_model(self):
        class UpstreamHandler(local_api.BaseHTTPRequestHandler):
            calls = []

            def log_message(self, *_args):
                return

            def do_POST(self):
                length = int(self.headers.get("Content-Length", "0"))
                payload = json.loads(self.rfile.read(length).decode("utf-8"))
                self.calls.append((self.path, payload, self.headers.get("X-API-Key")))
                if self.path == "/knowledge":
                    response = {"sources": [{"file_name": "guide.md", "snippet": "Noi dung."}]}
                else:
                    response = {"message": {"content": "Cau tra loi local."}}
                body = json.dumps(response).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

        upstream = local_api.ThreadingHTTPServer(("127.0.0.1", 0), UpstreamHandler)
        thread = threading.Thread(target=upstream.serve_forever, daemon=True)
        thread.start()
        try:
            base = "http://127.0.0.1:{}".format(upstream.server_port)
            engine = local_api.LocalAnswerEngine({
                "knowledge_url": base + "/knowledge",
                "knowledge_key": "knowledge-key",
                "knowledge_header": "X-API-Key",
                "knowledge_scheme": "",
                "llm_url": base + "/llm",
                "llm_key": "",
                "llm_model": "local",
                "llm_format": "ollama",
                "top_k": 5,
                "timeout": 5,
                "mock": False,
            })
            result = engine.answer("Hoi", history=[])
            self.assertEqual(result["answer"], "Cau tra loi local.")
            self.assertEqual(UpstreamHandler.calls[0][0], "/knowledge")
            self.assertEqual(UpstreamHandler.calls[0][1], {"message": "Hoi", "top_k": 5})
            self.assertEqual(UpstreamHandler.calls[0][2], "knowledge-key")
            self.assertEqual(UpstreamHandler.calls[1][0], "/llm")
            self.assertEqual(UpstreamHandler.calls[1][1]["options"]["num_predict"], 256)
        finally:
            upstream.shutdown()
            upstream.server_close()
            thread.join(timeout=3)

    def test_http_contract_and_token(self):
        server = local_api.ThreadingHTTPServer(("127.0.0.1", 0), local_api.LocalAIHandler)
        server.engine = local_api.LocalAnswerEngine({
            "knowledge_url": "unused",
            "knowledge_key": "key",
            "knowledge_header": "X-API-Key",
            "knowledge_scheme": "",
            "llm_url": "unused",
            "llm_key": "",
            "llm_model": "local",
            "llm_format": "ollama",
            "top_k": 5,
            "timeout": 5,
            "mock": True,
        })
        server.engine._retrieve = lambda _question: {
            "sources": [{"title": "policy.txt", "snippet": "Noi dung."}],
        }
        server.config = {"token": "test-token", "cors_origin": ""}
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            url = "http://127.0.0.1:{}/api/ask".format(server.server_port)
            request = Request(
                url,
                data=json.dumps({"query": "hello"}).encode("utf-8"),
                headers={"Content-Type": "application/json", "X-Local-AI-Token": "test-token"},
                method="POST",
            )
            with urlopen(request, timeout=3) as response:
                payload = json.loads(response.read().decode("utf-8"))
            self.assertEqual(response.status, 200)
            self.assertIn("answer", payload)

            bad_request = Request(
                url,
                data=b'{"question":"hello"}',
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with self.assertRaises(HTTPError) as context:
                urlopen(bad_request, timeout=3)
            self.assertEqual(context.exception.code, 401)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=3)


if __name__ == "__main__":
    unittest.main()
