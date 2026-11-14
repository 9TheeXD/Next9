-- "Try the app" accounts: no survey and no quit data. Safe to run more than once.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'EXPLORER';
