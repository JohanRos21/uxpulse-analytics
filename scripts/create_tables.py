from pathlib import Path

from alembic import command
from alembic.config import Config


ROOT_DIR = Path(__file__).resolve().parents[1]


def main() -> None:
    config = Config(str(ROOT_DIR / "alembic.ini"))
    command.upgrade(config, "head")
    print("UXPulse database migrations applied successfully.")


if __name__ == "__main__":
    main()
