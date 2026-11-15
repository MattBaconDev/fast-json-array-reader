Node v22.23.4, Intel(R) Xeon(R) Processor @ 2.10GHz, 4 cores, linux x64. 64KB chunks, best of 3.

### literals-1m.json (6MB)

| Parser | Time | Rows | Peak heap | Peak RSS | Same rows as stream-json |
|---|---|---|---|---|---|
| JSON.parse (whole file) | 83ms | 1000000 | 14MB | 86MB | yes |
| splitter (core) | 91ms | 1000000 | 5MB | 60MB | yes |
| splitter (iterator) | 422ms | 1000000 | 22MB | 95MB | yes |
| splitter (stream) | 144ms | 1000000 | 6MB | 58MB | yes |
| stream-json | 376ms | 1000000 | 12MB | 74MB | yes |
| JSONStream | 695ms | 670896 | 7MB | 66MB | **no** |
| @streamparser/json | 181ms | 1000000 | 7MB | 65MB | yes |
| @datastream/json | 196ms | 1000000 | 7MB | 60MB | yes |
| jsonarrayfs | 793ms | 1000000 | 25MB | 96MB | yes |

### numbers-1m.json (11MB)

| Parser | Time | Rows | Peak heap | Peak RSS | Same rows as stream-json |
|---|---|---|---|---|---|
| JSON.parse (whole file) | 196ms | 1000000 | 37MB | 133MB | yes |
| splitter (core) | 256ms | 1000000 | 6MB | 58MB | yes |
| splitter (iterator) | 591ms | 1000000 | 11MB | 76MB | yes |
| splitter (stream) | 350ms | 1000000 | 7MB | 60MB | yes |
| stream-json | 827ms | 1000000 | 24MB | 119MB | yes |
| JSONStream | 1.37s | 1000000 | 7MB | 72MB | yes |
| @streamparser/json | 614ms | 1000000 | 7MB | 72MB | yes |
| @datastream/json | 303ms | 1000000 | 7MB | 59MB | yes |
| jsonarrayfs | 1.23s | 1000000 | 21MB | 94MB | yes |

### one-32mb-element.json (37MB)

| Parser | Time | Rows | Peak heap | Peak RSS | Same rows as stream-json |
|---|---|---|---|---|---|
| JSON.parse (whole file) | 362ms | 1 | 135MB | 259MB | yes |
| splitter (core) | 348ms | 1 | 135MB | 245MB | yes |
| splitter (iterator) | 344ms | 1 | 135MB | 264MB | yes |
| splitter (stream) | 403ms | 1 | 135MB | 271MB | yes |
| stream-json | 1.15s | 1 | 184MB | 257MB | yes |
| JSONStream | 701ms | 1 | 133MB | 219MB | yes |
| @streamparser/json | 2.22s | 1 | 341MB | 941MB | yes |
| @datastream/json | - | 0 | 438MB | 523MB | error: jsonParseStream buffer (16801580) exceeds maxBufferSize (16777216) |
| jsonarrayfs | 5.43s | 1 | 1246MB | 1347MB | **no** |

### rows-100mb.json (95MB)

| Parser | Time | Rows | Peak heap | Peak RSS | Same rows as stream-json |
|---|---|---|---|---|---|
| JSON.parse (whole file) | 1.37s | 112213 | 343MB | 615MB | yes |
| splitter (core) | 1.07s | 112213 | 7MB | 62MB | yes |
| splitter (iterator) | 1.25s | 112213 | 7MB | 60MB | yes |
| splitter (stream) | 1.47s | 112213 | 7MB | 61MB | yes |
| stream-json | 3.22s | 112213 | 21MB | 110MB | yes |
| JSONStream | 3.01s | 112213 | 11MB | 68MB | **no** |
| @streamparser/json | 4.18s | 112213 | 9MB | 109MB | yes |
| @datastream/json | 1.47s | 112213 | 12MB | 72MB | yes |
| jsonarrayfs | 5.31s | 112213 | 19MB | 87MB | **no** |

### rows-450mb.json (429MB)

| Parser | Time | Rows | Peak heap | Peak RSS | Same rows as stream-json |
|---|---|---|---|---|---|
| JSON.parse (whole file) | 4.61s | 124813 | 1506MB | 2458MB | yes |
| splitter (core) | 3.85s | 124813 | 7MB | 61MB | yes |
| splitter (iterator) | 3.89s | 124813 | 9MB | 64MB | yes |
| splitter (stream) | 4.43s | 124813 | 7MB | 62MB | yes |
| stream-json | 8.05s | 124813 | 21MB | 109MB | yes |
| JSONStream | 8.53s | 124813 | 13MB | 74MB | **no** |
| @streamparser/json | 14.03s | 124813 | 19MB | 100MB | yes |
| @datastream/json | 4.71s | 124813 | 20MB | 89MB | yes |
| jsonarrayfs | 22.45s | 124813 | 18MB | 87MB | **no** |

### strings-1m.json (11MB)

| Parser | Time | Rows | Peak heap | Peak RSS | Same rows as stream-json |
|---|---|---|---|---|---|
| JSON.parse (whole file) | 278ms | 1000000 | 66MB | 177MB | yes |
| splitter (core) | 260ms | 1000000 | 6MB | 59MB | yes |
| splitter (iterator) | 592ms | 1000000 | 13MB | 90MB | yes |
| splitter (stream) | 350ms | 1000000 | 6MB | 59MB | yes |
| stream-json | 674ms | 1000000 | 22MB | 101MB | yes |
| JSONStream | 1.01s | 1000000 | 7MB | 65MB | **no** |
| @streamparser/json | 623ms | 1000000 | 7MB | 77MB | yes |
| @datastream/json | 313ms | 1000000 | 7MB | 60MB | yes |
| jsonarrayfs | 801ms | 1000000 | 20MB | 90MB | **no** |
