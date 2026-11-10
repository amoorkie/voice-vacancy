"""Проверяет локальные ссылки и метаданные SDD без внешних зависимостей."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[1]
LINK = re.compile(r"!?\[[^\]\n]*\]\(([^)\n]+)\)")
ALLOWED_STATUSES = {"draft", "ready-for-review", "accepted", "implemented", "superseded"}


def check_links(path: Path, content: str) -> list[str]:
    """Находит отсутствующие локальные цели простых Markdown-ссылок.

    Внешние URL и якоря не проверяются: доступность сети и рендеринг заголовков
    требуют отдельной проверки. Это ограничение явно указано в отчёте.
    """
    errors = []
    without_code = re.sub(r"```.*?```", "", content, flags=re.DOTALL)
    for raw_target in LINK.findall(without_code):
        target = raw_target.strip().strip("<>")
        parsed = urlsplit(target)
        if parsed.scheme or parsed.netloc or not parsed.path:
            continue
        resolved = (path.parent / unquote(parsed.path)).resolve()
        if not resolved.is_relative_to(ROOT) or not resolved.exists():
            errors.append(f"{path.relative_to(ROOT)}: отсутствует локальная цель {target}")
    return errors


def check_registry() -> list[str]:
    """Сверяет реестр с файлами и основанием принятия спецификации."""
    registry = ROOT / "docs/specs/registry.json"
    if not registry.exists():
        return []
    errors = []
    entries = json.loads(registry.read_text(encoding="utf-8"))
    if not isinstance(entries, list):
        return ["docs/specs/registry.json: ожидается список спецификаций"]
    seen = set()
    for entry in entries:
        if not isinstance(entry, dict):
            errors.append("Реестр: запись должна быть объектом")
            continue
        spec_id = entry.get("id", "")
        status = entry.get("status", "")
        relative = entry.get("path", "")
        if not re.fullmatch(r"F\d{3}", spec_id) or spec_id in seen:
            errors.append(f"Реестр: неверный или повторный ID {spec_id!r}")
        seen.add(spec_id)
        if status not in ALLOWED_STATUSES:
            errors.append(f"{spec_id}: неизвестный статус {status!r}")
        spec = (ROOT / relative).resolve()
        if not relative or not spec.is_relative_to(ROOT / "docs/specs") or not spec.is_file():
            errors.append(f"{spec_id}: отсутствует или недопустим путь {relative!r}")
            continue
        content = spec.read_text(encoding="utf-8")
        for marker in (f"ID: {spec_id}", f"Status: {status}"):
            if marker not in content:
                errors.append(f"{spec_id}: файл и реестр расходятся по {marker!r}")
        if status in {"accepted", "implemented"} and not entry.get("acceptance_evidence"):
            errors.append(f"{spec_id}: нет основания принятия владельцем")
    return errors


def main() -> int:
    """Возвращает ненулевой код при нарушении проверяемой структуры документов."""
    errors = []
    files = sorted(ROOT.rglob("*.md"))
    for path in files:
        if any(part in {".git", "node_modules", ".venv"} for part in path.parts):
            continue
        try:
            content = path.read_text(encoding="utf-8")
            if "\ufffd" in content:
                errors.append(f"{path.relative_to(ROOT)}: найден символ ошибки декодирования")
            errors.extend(check_links(path, content))
        except (UnicodeError, ValueError) as error:
            errors.append(f"{path.relative_to(ROOT)}: {error}")
    try:
        errors.extend(check_registry())
    except (ValueError, TypeError, OSError) as error:
        errors.append(f"Реестр спецификаций: {error}")
    if errors:
        print("\n".join(errors))
        return 1
    print(f"OK: Markdown-файлов {len(files)}; локальные ссылки и реестр проверены.")
    print("Внешние URL, якоря, смысл требований и готовность продукта не проверяются.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
