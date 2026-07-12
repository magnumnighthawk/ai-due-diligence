import os

import psycopg


def get_conn() -> psycopg.Connection:
    return psycopg.connect(os.environ["DATABASE_URL"])
