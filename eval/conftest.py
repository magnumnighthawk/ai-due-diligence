import pathlib
import sys

# Make `lib` (eval helpers) and the api `app` package importable from tests
# regardless of pytest's invocation directory.
EVAL_DIR = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(EVAL_DIR))
sys.path.insert(0, str(EVAL_DIR.parent / "api"))
