"""add paypal_capture_id to payment_attempts

Revision ID: 3a8c174d9e2b
Revises: 2f8319c5a1a1
Create Date: 2026-11-06 23:25:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3a8c174d9e2b'
down_revision: Union[str, Sequence[str], None] = '2f8319c5a1a1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('payment_attempts', sa.Column('paypal_capture_id', sa.String(length=64), nullable=True))
    op.create_index(op.f('ix_payment_attempts_paypal_capture_id'), 'payment_attempts', ['paypal_capture_id'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_payment_attempts_paypal_capture_id'), table_name='payment_attempts')
    op.drop_column('payment_attempts', 'paypal_capture_id')

