# BROKEN — for reference only. Do not import.
def count_tokens(path):
    # bug: reads as bytes, no UTF-8 decode
    with open(path, 'rb') as f:
        data = f.read()
    # bug: split on b' ' only, misses tabs/newlines
    parts = data.split(b' ')
    out = {}
    for p in parts:
        out[p] = out.get(p, 0) + 1
    return out