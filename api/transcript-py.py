from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import json
import re

from youtube_transcript_api import YouTubeTranscriptApi

VIDEO_ID_PATTERN = re.compile(r'^[A-Za-z0-9_-]{11}$')


class handler(BaseHTTPRequestHandler):
    def _send(self, status, body):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(json.dumps(body).encode())

    def do_GET(self):
        params = parse_qs(urlparse(self.path).query)
        video_id = (params.get('videoId') or [''])[0]
        if not VIDEO_ID_PATTERN.match(video_id):
            self._send(400, {'error': 'Missing or malformed videoId'})
            return
        try:
            ft = YouTubeTranscriptApi().fetch(video_id)
            segments = [
                {
                    'text': s.text,
                    'startSeconds': s.start,
                    'durationSeconds': s.duration,
                }
                for s in ft.snippets
            ]
            self._send(200, {
                'segments': segments,
                'count': len(segments),
                'lang': ft.language_code,
            })
        except Exception as e:
            self._send(502, {
                'error': str(e)[:400],
                'kind': type(e).__name__,
            })
