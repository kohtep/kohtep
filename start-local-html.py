import http.server
import socketserver
import socket
import os

class SPARequestHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path != "/" and not os.path.exists(self.path.strip("/")):
            self.path = "/index.html"
        return http.server.SimpleHTTPRequestHandler.do_GET(self)

def get_primary_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    finally:
        s.close()

PORT = 8000
os.chdir(os.path.dirname(os.path.abspath(__file__)))
primary_ip = get_primary_ip()

with socketserver.TCPServer(("", PORT), SPARequestHandler) as httpd:
    print("Server started at:")
    print(f"  http://localhost:{PORT}")
    print(f"  http://{primary_ip}:{PORT}")
    httpd.serve_forever()
