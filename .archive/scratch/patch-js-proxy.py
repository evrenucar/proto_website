import sys

with open('JavaScript/braindump.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Update renderNode condition
old_cond = 'if (nodeObj.url && (!nodeObj.title || (getYouTubeVideoId(nodeObj.url) && !nodeObj.image))) {'
new_cond = 'if (nodeObj.url && (!nodeObj.title || (getYouTubeVideoId(nodeObj.url) && (!nodeObj.image || !nodeObj.embedRatio)))) {'

if old_cond in content:
    content = content.replace(old_cond, new_cond)
    print("Replaced renderNode condition (LF)")
elif old_cond.replace('\\n', '\\r\\n') in content:
    content = content.replace(old_cond.replace('\\n', '\\r\\n'), new_cond.replace('\\n', '\\r\\n'))
    print("Replaced renderNode condition (CRLF)")
else:
    print("Could not find renderNode condition")

# Update fetchBookmarkPreview to use the new proxy
old_fetch_start = """async function fetchBookmarkPreview(nodeObj, el) {
  const videoId = getYouTubeVideoId(nodeObj.url);

  if (videoId) {"""

new_fetch_start = """async function fetchBookmarkPreview(nodeObj, el) {
  const videoId = getYouTubeVideoId(nodeObj.url);

  if (videoId) {
    // Try to get real dimensions from our local proxy if available
    try {
      const metaRes = await fetch(`/api/get-video-meta?url=${encodeURIComponent(nodeObj.url)}`);
      if (metaRes.ok) {
        const meta = await metaRes.json();
        if (meta.width && meta.height) {
          nodeObj.embedRatio = meta.width / meta.height;
          markBoardDirty();
        }
      }
    } catch (e) {
      // Ignore proxy failures, fallback to oembed
    }
"""

if old_fetch_start in content:
    content = content.replace(old_fetch_start, new_fetch_start)
    print("Replaced fetchBookmarkPreview start (LF)")
elif old_fetch_start.replace('\\n', '\\r\\n') in content:
    content = content.replace(old_fetch_start.replace('\\n', '\\r\\n'), new_fetch_start.replace('\\n', '\\r\\n'))
    print("Replaced fetchBookmarkPreview start (CRLF)")
else:
    print("Could not find fetchBookmarkPreview start")

with open('JavaScript/braindump.js', 'w', encoding='utf-8') as f:
    f.write(content)
