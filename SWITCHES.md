# Proving-ground switches

The app exposes switches (guarded by the `x-control-token` header) so a real failure can be made and then cleared:

- `POST /control/outage {"on": true}` takes `/health` down with a 503; the app logs it at error level.
