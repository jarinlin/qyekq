import hashlib
import hmac
import os
import secrets
import time

from qyebot import db

USER_KEY = "auth_user"
SALT_KEY = "auth_salt"
PASS_KEY = "auth_pass"
SECRET_KEY = "auth_secret"


def ensure_auth():
    settings = db.get_settings()
    if settings.get(SECRET_KEY) and settings.get(PASS_KEY) and settings.get(SALT_KEY):
        return
    user = os.environ.get("QYEKQ_USER", "qyekq")
    password = os.environ.get("QYEKQ_PASSWORD", "qyekq")
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 120_000).hex()
    db.set_settings(
        {
            USER_KEY: user,
            SALT_KEY: salt,
            PASS_KEY: digest,
            SECRET_KEY: secrets.token_hex(32),
        }
    )


def check_password(username, password):
    settings = db.get_settings()
    user = settings.get(USER_KEY) or ""
    salt = settings.get(SALT_KEY) or ""
    stored = settings.get(PASS_KEY) or ""
    if not user or not salt or not stored or not hmac.compare_digest(username, user):
        return False
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 120_000).hex()
    return hmac.compare_digest(digest, stored)


def issue_token(remember):
    secret = db.get_settings().get(SECRET_KEY) or ""
    ttl = 14 * 24 * 3600 if remember else 12 * 3600
    exp = int(time.time()) + ttl
    sig = hmac.new(secret.encode(), str(exp).encode(), hashlib.sha256).hexdigest()
    return f"{exp}.{sig}"


def token_ok(header):
    if not header or not header.lower().startswith("bearer "):
        return False
    raw = header.split(" ", 1)[1].strip()
    exp_text, dot, sig = raw.partition(".")
    if not dot or not exp_text.isdigit() or not sig:
        return False
    if int(exp_text) < int(time.time()):
        return False
    secret = db.get_settings().get(SECRET_KEY) or ""
    expect = hmac.new(secret.encode(), exp_text.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expect, sig)
