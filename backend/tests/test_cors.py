import unittest

from app.main import app


class CorsTests(unittest.TestCase):
    def test_dashboard_cors_allows_authenticated_extension_status(self):
        middleware = next(item for item in app.user_middleware if item.cls.__name__ == "CORSMiddleware")
        config = middleware.kwargs

        self.assertIn("http://localhost:3000", config["allow_origins"])
        self.assertIn("GET", config["allow_methods"])
        self.assertIn("POST", config["allow_methods"])
        self.assertIn("authorization", [header.lower() for header in config["allow_headers"]])


if __name__ == "__main__":
    unittest.main()
