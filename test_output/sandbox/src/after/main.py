"""Token counter — correct impl."""

def count_tokens(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        text = f.read()
    out = {}
    for tok in text.split():
        out[tok] = out.get(tok, 0) + 1
    return out

def main(argv=None):
    import sys
    argv = argv if argv is not None else sys.argv[1:]
    if not argv:
        print("usage: token-counter FILE")
        return 1
    counts = count_tokens(argv[0])
    for tok, n in sorted(counts.items(), key=lambda kv: -kv[1]):
        print(f"{tok}\t{n}")
    return 0

if __name__ == "__main__":
    import sys
    sys.exit(main(sys.argv[1:]))
