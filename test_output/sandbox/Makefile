.PHONY: install test lint run clean

install:
	pip install -e .

test:
	pytest tests/ -v

lint:
	ruff check src/ tests/

run:
	python -m src.after.main sample.txt

clean:
	rm -rf __pycache__ .pytest_cache