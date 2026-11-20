import uvicorn

from qyebot.config import log_config

if __name__ == "__main__":
    uvicorn.run("qyebot.main:app", host="127.0.0.1", port=8787, reload=False, log_config=log_config())
