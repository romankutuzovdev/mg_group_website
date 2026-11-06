import unittest
from types import SimpleNamespace

import jwt
from fastapi import HTTPException

from app.config import Settings
from app.services.auth_deps import create_access_token, decode_access_token


def _settings(**kw):
    base = dict(jwt_secret="dev-change-me", jwt_ttl_days=1, cabinet_dev_auth=False)
    return SimpleNamespace(**{**base, **kw})


class AuthDefaultsTest(unittest.TestCase):
    def test_no_admin_password_in_code(self):
        self.assertEqual(Settings.model_fields["cabinet_admin_password"].default, "")

    def test_token_signed_with_public_default_is_rejected(self):
        forged = jwt.encode({"sub": "8257414851"}, "dev-change-me", algorithm="HS256")
        with self.assertRaises(HTTPException):
            decode_access_token(forged, _settings())

    def test_own_tokens_work_without_a_configured_secret(self):
        s = _settings()
        token = create_access_token(telegram_id=5, user_id=1, settings=s)
        self.assertEqual(decode_access_token(token, s)["sub"], "5")

    def test_configured_secret_is_used(self):
        s = _settings(jwt_secret="x" * 40)
        token = create_access_token(telegram_id=5, user_id=1, settings=s)
        self.assertEqual(jwt.decode(token, "x" * 40, algorithms=["HS256"])["sub"], "5")

    def test_dev_auth_keeps_local_default(self):
        s = _settings(cabinet_dev_auth=True)
        token = create_access_token(telegram_id=5, user_id=1, settings=s)
        self.assertEqual(jwt.decode(token, "dev-change-me", algorithms=["HS256"])["sub"], "5")


if __name__ == "__main__":
    unittest.main()
