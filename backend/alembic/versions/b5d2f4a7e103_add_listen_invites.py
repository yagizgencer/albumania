"""add_listen_invites

Revision ID: b5d2f4a7e103
Revises: a7b3f1c98e21
Create Date: 2026-05-15 19:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b5d2f4a7e103'
down_revision: Union[str, Sequence[str], None] = 'a7b3f1c98e21'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'listen_invites',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('sender_username', sa.String(length=30), nullable=False),
        sa.Column('receiver_username', sa.String(length=30), nullable=False),
        sa.Column('album_id', sa.Integer(), nullable=False),
        sa.Column(
            'status',
            sa.Enum('pending', 'accepted', 'completed', name='listeninvitestatus'),
            nullable=False,
        ),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('(CURRENT_TIMESTAMP)'),
            nullable=False,
        ),
        sa.Column('responded_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['album_id'], ['albums.id']),
        sa.ForeignKeyConstraint(['sender_username'], ['users.username']),
        sa.ForeignKeyConstraint(['receiver_username'], ['users.username']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint(
            'sender_username',
            'receiver_username',
            'album_id',
            name='uq_listen_invite_pair_album',
        ),
    )
    with op.batch_alter_table('listen_invites', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_listen_invites_sender_username'), ['sender_username'], unique=False)
        batch_op.create_index(batch_op.f('ix_listen_invites_receiver_username'), ['receiver_username'], unique=False)
        batch_op.create_index(batch_op.f('ix_listen_invites_album_id'), ['album_id'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('listen_invites', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_listen_invites_album_id'))
        batch_op.drop_index(batch_op.f('ix_listen_invites_receiver_username'))
        batch_op.drop_index(batch_op.f('ix_listen_invites_sender_username'))
    op.drop_table('listen_invites')
