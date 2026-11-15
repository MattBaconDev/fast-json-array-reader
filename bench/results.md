Node v22.23.4, Intel(R) Xeon(R) Processor @ 2.10GHz, 4 cores, linux x64. 64KB chunks, best of 3.

### one-32mb-element.json (37MB)

| Parser | Time | Rows | Peak heap | Peak RSS | Same rows as stream-json |
|---|---|---|---|---|---|
| JSON.parse (whole file) | 309ms | 1 | 135MB | 177MB | yes |
| splitter (core) | 461ms | 1 | 135MB | 271MB | yes |
| splitter (iterator) | 493ms | 1 | 135MB | 261MB | yes |
| splitter (stream) | 561ms | 1 | 135MB | 267MB | yes |
| stream-json | 1.20s | 1 | 180MB | 259MB | yes |
| JSONStream | 709ms | 1 | 133MB | 219MB | yes |
| @streamparser/json | 2.46s | 1 | 731MB | 821MB | yes |
| @datastream/json | - | 0 | 412MB | 476MB | error: jsonParseStream buffer (16801580) exceeds maxBufferSize (16777216) |
| jsonarrayfs | 5.22s | 1 | 1245MB | 1349MB | **no** |
