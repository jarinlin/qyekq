import threading
import time

import redis

from qyebot.config import REDIS_URL

_mem = {}
_mem_lock = threading.Lock()
_client = None
_client_lock = threading.Lock()
LOCK_KEY = "qyebot:lock:tick"


def client():
    global _client
    if _client is None:
        with _client_lock:
            if _client is None:
                _client = redis.Redis.from_url(
                    REDIS_URL,
                    socket_connect_timeout=0.6,
                    socket_timeout=0.6,
                    decode_responses=True,
                    retry_on_timeout=False,
                )
    return _client


def ping():
    try:
        return bool(client().ping())
    except Exception:
        return False


def get(key):
    try:
        value = client().get(key)
        if value is not None:
            return value
    except Exception:
        pass
    with _mem_lock:
        item = _mem.get(key)
        if not item:
            return None
        if item[0] < time.time():
            _mem.pop(key, None)
            return None
        return item[1]


def set(key, value, ttl):
    try:
        client().set(key, value, ex=int(ttl))
        return
    except Exception:
        pass
    with _mem_lock:
        _mem[key] = (time.time() + ttl, value)


def delete(key):
    try:
        client().delete(key)
    except Exception:
        pass
    with _mem_lock:
        _mem.pop(key, None)


def acquire_lock(ttl=60):
    """True 拿到锁，False 别的进程持有，None 表示 Redis 不可用。"""
    try:
        return bool(client().set(LOCK_KEY, "1", nx=True, ex=ttl))
    except Exception:
        return None


def release_lock():
    delete(LOCK_KEY)
