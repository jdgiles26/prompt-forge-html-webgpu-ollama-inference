import pytest
from src.after.main import count_tokens

def test_empty_file(tmp_path):
    p = tmp_path / "e.txt"; p.write_text("", encoding="utf-8")
    assert count_tokens(str(p)) == {}

def test_single_token(tmp_path):
    p = tmp_path / "s.txt"; p.write_text("hello", encoding="utf-8")
    assert count_tokens(str(p)) == {"hello": 1}

def test_repeated_tokens(tmp_path):
    p = tmp_path / "r.txt"; p.write_text("a a b", encoding="utf-8")
    assert count_tokens(str(p)) == {"a": 2, "b": 1}

def test_whitespace_variants(tmp_path):
    p = tmp_path / "w.txt"; p.write_text("a\tb\nc  d", encoding="utf-8")
    assert count_tokens(str(p)) == {"a": 1, "b": 1, "c": 1, "d": 1}

def test_utf8_tokens(tmp_path):
    p = tmp_path / "u.txt"; p.write_text("café café naïve", encoding="utf-8")
    assert count_tokens(str(p)) == {"café": 2, "naïve": 1}

def test_returns_dict(tmp_path):
    p = tmp_path / "d.txt"; p.write_text("x y z", encoding="utf-8")
    r = count_tokens(str(p))
    assert isinstance(r, dict)

def test_missing_file_raises(tmp_path):
    with pytest.raises((FileNotFoundError, OSError)):
        count_tokens(str(tmp_path / "nope.txt"))

def test_large_file(tmp_path):
    p = tmp_path / "big.txt"
    p.write_text(" ".join(["x"] * 10000), encoding="utf-8")
    assert count_tokens(str(p))["x"] == 10000