# run.py - v1.0
# pip install flask
# Entry point for TAT-MIS-Architect. Invoked by Launcher_V3.py.
# Do not put application logic here. This file only bootstraps the factory.

from pathlib import Path
import sys

# Ensure the project root is on the path regardless of cwd
PROJECT_ROOT = Path(__file__).resolve().parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.app import create_app
from src.utils.logger import get_logger

log = get_logger(__name__)


def main() -> None:
    import os

    app = create_app()

    # Launcher_V3.py injects these env vars; fall back to config.json defaults
    host:  str  = os.environ.get('FLASK_HOST',  app.config.get('HOST',  '127.0.0.1'))
    port:  int  = int(os.environ.get('FLASK_PORT',  app.config.get('PORT',  5000)))
    debug: bool = os.environ.get('FLASK_DEBUG', '0') == '1' or app.config.get('DEBUG', False)

    print(f"[BLAZE MIS] ✓ TAT-MIS-Architect ready → http://{host}:{port}")
    log.info("Flask server starting on %s:%s (debug=%s)", host, port, debug)

    app.run(host=host, port=port, debug=debug, use_reloader=False)


if __name__ == '__main__':
    main()
