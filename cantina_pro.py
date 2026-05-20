import base64
import gzip
import os


APP_DIR = os.path.dirname(os.path.abspath(__file__))
PARTS = [
    "cantina_pro.py.gz.part1",
    "cantina_pro.py.gz.part2",
    "cantina_pro.py.gz.part3",
]


def load_source():
    payload = ""
    missing = []
    for name in PARTS:
        path = os.path.join(APP_DIR, name)
        if not os.path.exists(path):
            missing.append(name)
            continue
        with open(path, "r", encoding="utf-8") as file:
            payload += file.read().strip()
    if missing:
        joined = ", ".join(missing)
        raise FileNotFoundError(f"Arquivos do aplicativo nao encontrados: {joined}")
    return gzip.decompress(base64.b64decode(payload)).decode("utf-8")


source = load_source()
namespace = globals()
namespace["__file__"] = __file__
namespace["__name__"] = "__main__"
exec(compile(source, __file__, "exec"), namespace)
