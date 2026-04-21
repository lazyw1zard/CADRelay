from __future__ import annotations

import argparse

from app.services.firebase_auth_admin import ALLOWED_ROLES, set_auth_user_role


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Set Firebase custom role claim for a user")
    parser.add_argument("--uid", required=True, help="Firebase Auth UID")
    parser.add_argument("--role", required=True, choices=sorted(ALLOWED_ROLES))
    parser.add_argument(
        "--credentials",
        required=True,
        help="Path to service account JSON",
    )
    return parser.parse_args()


def main() -> int:
    # CLI-обертка для назначения роли из терминала.
    args = parse_args()
    row = set_auth_user_role(uid=args.uid, role=args.role, credentials_path=args.credentials)
    print(f"Updated role for uid={row['uid']}: role={row['role']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
