from datetime import date, datetime


def now_text():
    return datetime.now().isoformat(timespec="seconds")


def today_text():
    return date.today().isoformat()
