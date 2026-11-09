"""Run isolated routing journeys at a fixed open business window.

Only the test server's application clock is replaced. Production scheduling,
authorization, cash and database logic run normally.
"""
from pathlib import Path
import sys
from datetime import UTC, datetime, timedelta

sys.path.insert(0,str(Path(__file__).resolve().parents[2]/"backend"))
from tools.integrated_workspace import main
from app.db.models import utcnow
from tools.backend_test_dashboard import runtime

day=(datetime.now(UTC)+timedelta(hours=6,minutes=30)).date()
fixed=datetime(day.year,day.month,day.day,4,30,tzinfo=UTC)
class BusinessDateTime(datetime):
    @classmethod
    def now(cls,tz=None):
        return fixed.astimezone(tz) if tz else fixed.replace(tzinfo=None)

runtime.datetime=BusinessDateTime
for name,module in list(sys.modules.items()):
    if name.startswith("app.") and getattr(module,"utcnow",None) is utcnow:
        module.utcnow=lambda:fixed

if __name__=="__main__":
    main()
