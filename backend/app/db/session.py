from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings


class Base(DeclarativeBase):
    pass


_settings = get_settings()

_is_sqlite = _settings.database_url.startswith("sqlite")

_connect_args: dict = {}
_pool_kwargs: dict = {}

if _is_sqlite:
    _connect_args["check_same_thread"] = False
else:
    # Every endpoint is a sync `def`, so requests run in anyio's threadpool
    # (40 threads by default). SQLAlchemy's default pool is 5 + 10 overflow, so
    # threads 16-40 would queue on `pool_timeout` and then raise
    # "QueuePool limit of size 5 overflow 10 reached" — which is exactly how the
    # API fell over with two people using it. Size the pool to the threadpool
    # instead, so a connection is never the scarce resource.
    _pool_kwargs = {
        "pool_size": _settings.db_pool_size,
        "max_overflow": _settings.db_max_overflow,
        # Fail fast. A 30 s wait just converts one slow request into forty.
        "pool_timeout": _settings.db_pool_timeout,
        # Neon's proxy closes idle connections. Without pre-ping we hand out a
        # dead one and the request 500s — independent of load.
        "pool_pre_ping": True,
        "pool_recycle": 300,
    }
    _connect_args.update(
        {
            # Don't let a hung TCP connect occupy a pool slot indefinitely.
            "connect_timeout": 5,
            "keepalives": 1,
            "keepalives_idle": 30,
            "keepalives_interval": 10,
            "keepalives_count": 3,
        }
    )

engine = create_engine(
    _settings.database_url,
    connect_args=_connect_args,
    future=True,
    **_pool_kwargs,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
