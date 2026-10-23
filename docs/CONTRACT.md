# FactoryManagement3D v1 implementation contract

Prefix: `/modules/factory-management-3d`. The Inertia page is
`FactoryManagement3D/Workspace` with `{basePath, csrf_token, initialFactoryId}`. JSON success responses
are `{success:true,data:...,error:null,meta:{}}`; failures preserve Laravel HTTP
status and validation `errors` alongside a human-readable `message`/`error`.
All routes require an enabled module, session authentication, Admin or Supervisor,
exact tenant scoping (including null), and factory authorization where applicable.

## API

- GET `/catalog`: `{factories,lines,users,is_admin}`. Factory DTO:
  `{id,code,name,timezone,is_active,line_ids,can_edit,workstation_count}`.
  Line DTO `{id,code,name,factory_id}`; user DTO `{id,name}`. Users and unassigned
  lines are available to admins only; never expose another tenant's records.
- POST `/factories`, PATCH `/factories/{id}`:
  `{code,name,timezone,is_active,line_ids}` -> factory DTO.
- GET/PUT `/factories/{id}/members`: `{members:[{user_id,can_edit_layout}]}`.
  Admin only. IDs must identify same-tenant Admin/Supervisor users.
- GET `/factories/{id}/layout[?draft=1]`:
  `{factory,version,published_version,layout,can_edit}`. Draft is editor-only.
- PUT `/factories/{id}/layout/draft`: `{expected_version,layout}` -> same layout DTO.
- POST `/factories/{id}/layout/publish`: `{expected_version}` -> same layout DTO.
  CAS conflicts return 409; published state is an immutable copy of validated draft.
- GET `/factories/{id}/assets`: `{assets:[AssetDTO]}`.
- POST `/factories/{id}/assets`: multipart `model` -> AssetDTO.
  AssetDTO `{id,name,url,size_bytes,triangles}`. GLB only, self-contained, no
  external URIs or external decoders; max 20 MiB/250k triangles/4096px textures.
  Decoded limits: 64 MiB geometry, 128 MiB textures, 64 images, 64 node depth,
  20,000 expanded scene nodes. Sparse/viewless accessors are rejected.
- GET `/assets/{id}`: authorized private GLB response, never public storage URL.
- GET `/factories/{id}/snapshot`: Snapshot below.
- GET `/factories/{id}/orders/{id}[?after_step_id=ID]`: authorized order details,
  local operations only, 200 per page with nullable `next_cursor`.

## Layout v1

`{schema_version:1,floors:[],zones:[],objects:[]}`.

Floor: `{id,name,elevation,thickness,polygon:[[x,z],...],verified}`.
Zone: `{id,name,floor_id,polygon:[[x,z],...]}`.
Object: `{id,kind,label,floor_id,zone_id,workstation_id,asset_id,
position:{x,y,z},rotation:{x,y,z},dimensions:{width,height,depth},
verified_position,verified_geometry}`.

IDs for scene entities are stable opaque strings. `kind` is machine/wall/door/walkway.
Coordinates and dimensions are metres, Y up, X/Z floor; rotation is radians in
stored data and degrees in the editor. `zone_id`, `workstation_id`, `asset_id`
are nullable where inapplicable. Floor-relative object Y plus floor elevation
determines render height. Scene objects may not reference foreign floors/zones,
another factory's workstation/assets, or duplicate a machine within one layout.
Unverified placeholders are explicit; no fabricated physical dimensions/locations.

## Snapshot

`{factory_id,fetched_at,layout_revision,stations,orders,summary}`.
Station: `{id,code,name,line_id,line_name,state,state_source,state_since,
active_operations:[],last_operation:null,issues:[]}`.
Operation: `{step_id,batch_id,batch_number,lot_number,work_order_id,order_no,
step_name,status,passed_qty,scrap_qty,started_at,completed_at,workstation_id}`.
Order: `{id,order_no,status,planned_qty,produced_qty,progress_pct,due_date,
is_overdue,active_station_ids:[],last_station_id:null,partial_scope,url}`.
Issue: `{id,title,status,url}`.
Summary: `{total_machines,running,unknown,active_orders,overdue_orders,open_issues}`.

List ALL factory workstations regardless of tags or layout. State comes from
current WorkstationState (UNKNOWN when absent), separately from active operations.
Do not infer physical connectivity/position from production activity or state age.
Aggregate operations via assigned BatchStep workstation; do not drop concurrent
operations. Order totals come from core fields, never summed intermediate output.
No cross-factory operation/asset disclosure. Compare due dates in factory timezone.

## Frontend/renderer ownership interface

`resources/js/components/FactoryScene.jsx` exports default React component:
`({layout,stations,assets,selectedId,onSelect,onMove,editable=false,floorId=null,
viewMode='perspective',focusId=null,onError,resetKey=0,snap=0.1,showStructure=true})`.
`selectedId` and `focusId` are scene object IDs. `onSelect(id|null)`;
`onMove(id,{x,y,z})` supplies complete floor-relative position, preserving Y;
`editable` controls scene drag, never operational writes. HTML editor owns layouts
immutably and passes validated/sanitized local values. `assets` is AssetDTO[].
`floorId=null` shows all floors. `viewMode` is perspective/top. Changing `resetKey`
reframes even if selection/view mode is unchanged; `snap` is metres (0 disables),
`showStructure=false` hides walls and doors. Renderer must
preserve GLB materials, show theme-based state markers, observe runtime theme
changes, dispose resources, guard stale async loads and provide accessible fallback.

The page consumes shared OpenMES UI/layout/Icon exports only through runtime
contract, uses CSS namespace `.fm3d-*`, Geist/Geist Mono host fonts, current --om-*
tokens, light/dark + ThemeCustomizer. Design contract in artifacts is normative.

## Tests and packaging

Tests first; module-only PHP and JS coverage >=80%, integration isolation,
browser E2E and install/disable/reinstall checks. No production data mutations.
Package runtime PHP, migrations, module.json, Installer.php, compiled public bundle
and runtime sidecar under top-level FactoryManagement3D/. Exclude tests, secrets,
node_modules and development tools. Keep source and reports in workspace artifacts.
