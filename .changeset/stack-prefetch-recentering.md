---
"@orbidicom/core": patch
---

Re-center the background frame prefetch on the slice you are actually viewing.

Series warm-up previously used Cornerstone's `stackPrefetch`, which queues the whole series into the shared request pool up front and never clears it when re-centering. Scrolling mid-warm-up therefore left the queue grinding through the frames next to the _opening_ slice: jump to slice 300 of 400 and the prefetcher kept fetching 40, 41, 42, so scrolling ahead of the warm region stayed slow indefinitely.

Stack viewports now use their own prefetcher, which keeps a short queue in the pool and re-orders it around the current slice, nearest-first. The whole series still gets warmed and the "caching X/Y" progress bar is unchanged. Unlike `stackPrefetch` — whose re-center clears the _entire global_ prefetch pool — it only ever touches its own requests, so scrolling one cell of a grid no longer stalls the warm-up of the others.
