# Spark Traffic Estimation

## Firebase Spark Quotas (Firestore)

- Stored data: `1 GiB`
- Document reads: `50,000 / day`
- Document writes: `20,000 / day`
- Document deletes: `20,000 / day`
- Outbound transfer: `10 GiB / month`

## Baseline Scenario

- 100 guilds
- 4 reminders per guild
- total reminders = `400`
- mixed schedule:
  - 50% daily
  - 50% weekday
- average trigger/day/reminder = `(1 + 5/7) / 2 = 0.857`

## Estimated Operations Per Day

### Dispatch volume

- dispatches/day = `400 * 0.857 = 343`

### Reads

- worker bucket scans/day = `288` (every 5 min)
- per dispatch reads (bucket item + reminder) = `2`
- total reads/day = `288 + (343 * 2) = 974`

### Writes

- dispatch log write/day ~= `343`
- normal create/update/delete admin operations are low at this scale
- total writes/day safely below `20,000`

### Deletes

- retention: 7-day rolling window
- steady state deletes/day ~= dispatches/day ~= `343`
- safely below `20,000 / day`

## Free Cap X Estimation

To keep healthy headroom for spikes, reserve at least 40% daily write quota.

- usable write budget = `20,000 * 0.6 = 12,000`
- average writes per reminder/day ~= `0.857`
- max reminders by writes ~= `12,000 / 0.857 ~= 14,000`

Recommended production cap:

- `X = 10,000` (safe default)
- warning at `8,500` and `9,500`
- lock at `10,000`
- unlock at `9,800`

## Notes

- If future implementation adds extra writes per dispatch (for example `lastSentAt` updates), reduce `X`.
- Monitor Firestore usage dashboard weekly and adjust `X` by observed write slope.
