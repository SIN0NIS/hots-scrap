# -*- coding: utf-8 -*-
"""hots_scrap 개발 서버 — 캐시 금지 헤더를 붙여, 수정이 즉시 브라우저에 반영되게 한다.
사용: python devserver.py [포트]  (저장소 루트를 서빙)"""
import functools
import http.server
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent  # hots_scrap/

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, must-revalidate")
        super().end_headers()

    def log_message(self, fmt, *args):  # 조용히
        pass

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8800
    handler = functools.partial(NoCacheHandler, directory=str(ROOT))
    print(f"hots_scrap dev server: http://localhost:{port}/site/ (root={ROOT})")
    http.server.ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()
