"""add approval_url to payment_attempts

Revision ID: 2f8319c5a1a1
Revises: 1687694e3aaf
Create Date: 2026-10-20 23:33:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2f8319c5a1a1'
down_revision: Union[str, Sequence[str], None] = '1687694e3aaf'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('payment_attempts', sa.Column('approval_url', sa.String(length=512), nullable=True))


def downgrade() -> None:
    op.drop_column('payment_attempts', 'approval_url')
