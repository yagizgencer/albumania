"""add_friend_dashboard_entries

Revision ID: a7b3f1c98e21
Revises: c08ff9961194
Create Date: 2026-05-15 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a7b3f1c98e21'
down_revision: Union[str, Sequence[str], None] = 'c08ff9961194'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'friend_dashboard_entries',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('friendship_id', sa.Integer(), nullable=False),
        sa.Column('album_id', sa.Integer(), nullable=False),
        sa.Column('mutual_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('similarity_users', sa.Float(), nullable=True),
        sa.Column('mean_score', sa.Float(), nullable=False),
        sa.Column('user_a_score', sa.Float(), nullable=False),
        sa.Column('user_b_score', sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(['album_id'], ['albums.id']),
        sa.ForeignKeyConstraint(['friendship_id'], ['friendships.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('friendship_id', 'album_id', name='uq_friend_dashboard_entry_pair_album'),
    )
    with op.batch_alter_table('friend_dashboard_entries', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_friend_dashboard_entries_friendship_id'), ['friendship_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_friend_dashboard_entries_album_id'), ['album_id'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('friend_dashboard_entries', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_friend_dashboard_entries_album_id'))
        batch_op.drop_index(batch_op.f('ix_friend_dashboard_entries_friendship_id'))
    op.drop_table('friend_dashboard_entries')
