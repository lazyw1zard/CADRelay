from __future__ import annotations

import argparse
from pathlib import Path

import firebase_admin
from firebase_admin import auth, credentials

ALLOWED_ROLES = {"viewer", "editor", "reviewer", "admin"}


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
    args = parse_args()
    cred_path = Path(args.credentials)
    if not cred_path.exists():
        raise SystemExit(f"Credentials file not found: {cred_path}")

    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(str(cred_path)))

    user = auth.get_user(args.uid)
    claims = dict(user.custom_claims or {})
    claims["role"] = args.role
    auth.set_custom_user_claims(args.uid, claims)
    print(f"Updated role for uid={args.uid}: role={args.role}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
