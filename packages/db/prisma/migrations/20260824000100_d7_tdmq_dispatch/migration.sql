ALTER TYPE "outbox_state" ADD VALUE IF NOT EXISTS 'dispatching' BEFORE 'claimed';
ALTER TYPE "outbox_state" ADD VALUE IF NOT EXISTS 'dispatched' BEFORE 'claimed';
