"""
calendar.py — Deadline arithmetic for the resolution SLA (pure, no I/O).

Rules
  • Days are counted in India Standard Time (fixed UTC+05:30, no DST).
  • "Within N days" means by the END of the Nth day after the start date (23:59:59 IST),
    so a complaint filed at 17:00 on Monday is not penalised for the hours already gone.
  • Working days skip the weekly off-days (default Sunday only: Puravankara works
    Monday–Saturday) and the company holiday list.
"""

import os
from datetime import date, datetime, time, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30), "IST")
END_OF_DAY = time(23, 59, 59)


def _weekly_off_from_env() -> frozenset[int]:
    """Python weekday numbers (Mon=0 … Sun=6) that are never working days."""
    raw = os.getenv("SLA_WEEKLY_OFF", "6")
    days = set()
    for part in raw.split(","):
        part = part.strip()
        if part.isdigit() and 0 <= int(part) <= 6:
            days.add(int(part))
    return frozenset(days) or frozenset({6})


WEEKLY_OFF = _weekly_off_from_env()


def to_ist(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(IST)


def is_working_day(d: date, holidays: frozenset[date] | set[date] = frozenset(),
                   weekly_off: frozenset[int] = WEEKLY_OFF) -> bool:
    return d.weekday() not in weekly_off and d not in holidays


def _end_of_day_utc(d: date) -> datetime:
    return datetime.combine(d, END_OF_DAY, tzinfo=IST).astimezone(timezone.utc)


def add_calendar_days(start: datetime, days: int) -> datetime:
    """End of the day `days` calendar days after the start date (IST), as UTC."""
    return _end_of_day_utc(to_ist(start).date() + timedelta(days=days))


def add_working_days(start: datetime, days: int,
                     holidays: frozenset[date] | set[date] = frozenset(),
                     weekly_off: frozenset[int] = WEEKLY_OFF) -> datetime:
    """End of the `days`-th working day after the start date (IST), as UTC.
    The start date itself never counts, whether or not it is a working day."""
    d = to_ist(start).date()
    counted = 0
    while counted < days:
        d += timedelta(days=1)
        if is_working_day(d, holidays, weekly_off):
            counted += 1
    return _end_of_day_utc(d)


def add_days(start: datetime, days: int, calendar: str,
             holidays: frozenset[date] | set[date] = frozenset()) -> datetime:
    if calendar == "working":
        return add_working_days(start, days, holidays)
    return add_calendar_days(start, days)
