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
COOKIE = "qyekq_session"
ITERATIONS = 120_000


def ensure_auth():
    settings = db.get_settings()
    if settings.get(SECRET_KEY) and settings.get(PASS_KEY) and settings.get(SALT_KEY):
        return
    user = (os.environ.get("QYEKQ_USER") or "").strip()
    password = os.environ.get("QYEKQ_PASSWORD") or ""
    if not user or not password:
        return
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), ITERATIONS).hex()
    db.set_settings(
        {
            USER_KEY: user,
            SALT_KEY: salt,
            PASS_KEY: digest,
            SECRET_KEY: secrets.token_hex(32),
        }
    )


def salt_for(username):
    settings = db.get_settings()
    user = settings.get(USER_KEY) or ""
    salt = settings.get(SALT_KEY) or ""
    if user and salt and _eq(username, user):
        return salt
    secret = settings.get(SECRET_KEY) or "unset"
    return hmac.new(secret.encode(), f"salt:{username}".encode(), hashlib.sha256).hexdigest()[:32]


def issue_nonce():
    nonce = secrets.token_hex(16)
    db.set_settings(
        {
            "auth_nonce": nonce,
            "auth_nonce_exp": str(int(time.time()) + 90),
        }
    )
    return nonce


def _eq(left, right):
    left = left or ""
    right = right or ""
    if len(left) != len(right):
        return False
    return hmac.compare_digest(left, right)


def check_proof(username, proof, nonce):
    settings = db.get_settings()
    saved = settings.get("auth_nonce") or ""
    exp = settings.get("auth_nonce_exp") or "0"
    db.set_settings({"auth_nonce": "", "auth_nonce_exp": "0"})
    if not saved or not exp.isdigit() or int(exp) < int(time.time()):
        return False
    if not _eq(saved, nonce or ""):
        return False
    user = settings.get(USER_KEY) or ""
    stored = settings.get(PASS_KEY) or ""
    if not user or not stored or not _eq(username, user):
        return False
    if len(proof or "") != 64:
        return False
    expect = hmac.new(nonce.encode(), stored.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expect, proof.lower())


_fails = {}


def login_blocked(username):
    count, until = _fails.get(username) or (0, 0)
    return count >= 5 and until > time.time()


def note_login(username, ok):
    if ok:
        _fails.pop(username, None)
        return
    count, until = _fails.get(username) or (0, 0)
    if until and until < time.time():
        count = 0
    count += 1
    _fails[username] = (count, time.time() + 60 if count >= 5 else 0)


def issue_token(remember):
    secret = db.get_settings().get(SECRET_KEY) or ""
    sid = secrets.token_hex(16)
    db.set_settings({"auth_sid": sid})
    ttl = 14 * 24 * 3600 if remember else 12 * 3600
    exp = int(time.time()) + ttl
    payload = f"{exp}.{sid}"
    sig = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}.{sig}", ttl


def revoke_session():
    db.set_settings({"auth_sid": ""})


def token_ok(raw):
    if not raw:
        return False
    exp_text, sid, sig = raw.split(".", 2) if raw.count(".") == 2 else ("", "", "")
    if not exp_text.isdigit() or not sid or not sig:
        return False
    if int(exp_text) < int(time.time()):
        return False
    settings = db.get_settings()
    if not _eq(sid, settings.get("auth_sid") or ""):
        return False
    secret = settings.get(SECRET_KEY) or ""
    expect = hmac.new(secret.encode(), f"{exp_text}.{sid}".encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expect, sig)
