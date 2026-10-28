import unittest

from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from app.main import app


class CorsTests(unittest.TestCase):
    def test_dashboard_cors_allows_authenticated_extension_status(self):
        self.assertIsInstance(app, CORSMiddleware)
        self.assertIn("http://localhost:3000", app.allow_origins)
        self.assertIn("GET", app.allow_methods)
        self.assertIn("POST", app.allow_methods)
        self.assertIn("authorization", [header.lower() for header in app.allow_headers])

    def test_cors_wraps_the_api_application(self):
        self.assertIsInstance(app, CORSMiddleware)
        self.assertIsInstance(app.app, FastAPI)


if __name__ == "__main__":
    unittest.main()
