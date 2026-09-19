# Full-screen Trend chart

## Build
- Add a 44px Expand control to the existing Trend card.
- Open the already-loaded chart data in a viewport-filling dialog with the current range, Close control, tooltip, legend, and caption.
- Keep the inline chart unchanged and make the expanded chart resize in portrait and landscape.
- Push one browser history entry when opened; close on Back, Close, or Escape without leaving Dashboard.

## Verify
- Run the project type check and build.
- In mentor view of the main account, select This Quarter and capture expanded-chart screenshots at 390×844 and 844×390.
- Confirm browser Back closes the chart while remaining on Dashboard.
- Confirm expanding creates no additional `get_period_series` request.
