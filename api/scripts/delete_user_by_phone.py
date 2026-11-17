"""Удалить аккаунт кабинета по телефону (только без сделок).

Сначала показывает, кого нашёл; удаляет только с флагом --yes:
    .venv\\Scripts\\python scripts\\delete_user_by_phone.py 375296376002
    .venv\\Scripts\\python scripts\\delete_user_by_phone.py 375296376002 --yes
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings  # noqa: E402
from app.services.cabinet_store import cabinet_store  # noqa: E402


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 1:
        print(__doc__)
        return 2
    print(f"База: {get_settings().cabinet_db_path}")
    try:
        user = cabinet_store.get_user_by_phone(args[0])
    except ValueError as exc:
        print(exc)
        return 2
    if not user:
        print("Аккаунт с таким телефоном не найден")
        return 1
    name = " ".join(p for p in (user.first_name, user.last_name) if p) or "—"
    print(f"Найден: id={user.id} · {name} · {user.phone} · создан {user.created_at}")
    if user.is_admin or user.is_manager or user.is_logist:
        print("Это сотрудник — скрипт удаляет только клиентов")
        return 1
    if "--yes" not in sys.argv:
        print("Ничего не удалено. Повторите с --yes, чтобы удалить.")
        return 0
    try:
        cabinet_store.delete_user(user.id)
    except ValueError as exc:
        print(exc)
        return 1
    print("Удалён.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
