import assert from "node:assert/strict";
import test from "node:test";
import { buildBilibiliEmbed, normalizeUrlInput, parseVideoUrl } from "../src/providers";

test("parses YouTube watch, short and shorts links", () => {
  for (const url of [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ",
    "https://www.youtube.com/shorts/dQw4w9WgXcQ?feature=share",
    "https://m.youtube.com/watch?v=dQw4w9WgXcQ"
  ]) {
    const parsed = parseVideoUrl(url);
    assert.equal(parsed?.provider, "youtube");
    assert.equal(parsed?.videoId, "dQw4w9WgXcQ");
    assert.match(parsed?.embedUrl || "", /youtube\.com\/embed\/dQw4w9WgXcQ/);
  }
});

test("does not treat a malformed YouTube id as YouTube", () => {
  const parsed = parseVideoUrl("https://www.youtube.com/watch?v=short");
  assert.equal(parsed?.provider, "web");
});

test("parses Bilibili BV, av, page and b23 links", () => {
  const bv = parseVideoUrl("https://www.bilibili.com/video/BV1xx411c7mD?p=2");
  assert.equal(bv?.provider, "bilibili");
  assert.equal(bv?.videoId, "BV1xx411c7mD");
  assert.equal(bv?.page, 2);
  assert.match(bv?.embedUrl || "", /bvid=BV1xx411c7mD/);
  assert.match(bv?.embedUrl || "", /page=2/);

  const av = parseVideoUrl("https://www.bilibili.com/video/av170001");
  assert.equal(av?.provider, "bilibili");
  assert.equal(av?.videoId, "av170001");
  assert.match(av?.embedUrl || "", /aid=170001/);

  const short = parseVideoUrl("https://b23.tv/abcdefg");
  assert.equal(short?.provider, "bilibili");
  assert.equal(short?.isShortLink, true);
  assert.equal(short?.videoId, undefined);
});

test("parses Vimeo with and without a private hash", () => {
  const plain = parseVideoUrl("https://vimeo.com/76979871");
  assert.equal(plain?.provider, "vimeo");
  assert.equal(plain?.videoId, "76979871");
  assert.match(plain?.embedUrl || "", /player\.vimeo\.com\/video\/76979871/);

  const hidden = parseVideoUrl("https://vimeo.com/76979871/abc123def");
  assert.equal(hidden?.videoId, "76979871");
  assert.match(hidden?.embedUrl || "", /h=abc123def/);
});

test("parses direct video files and generic pages", () => {
  assert.equal(parseVideoUrl("https://cdn.example.com/demo.mp4")?.provider, "direct");
  assert.equal(parseVideoUrl("https://example.com/article")?.provider, "web");
  assert.equal(parseVideoUrl("not a url"), null);
});

test("normalizes common pasted links", () => {
  assert.equal(
    normalizeUrlInput("www.bilibili.com/video/BV1xx411c7mD"),
    "https://www.bilibili.com/video/BV1xx411c7mD"
  );
  assert.equal(normalizeUrlInput("//youtu.be/dQw4w9WgXcQ"), "https://youtu.be/dQw4w9WgXcQ");
});

test("accepts bare Bilibili BV, av, ep and ss ids", () => {
  assert.equal(
    normalizeUrlInput("BV17f4y1n7et"),
    "https://www.bilibili.com/video/BV17f4y1n7et"
  );
  assert.equal(parseVideoUrl("BV17f4y1n7et")?.videoId, "BV17f4y1n7et");
  assert.equal(parseVideoUrl("av170001")?.videoId, "av170001");
  assert.equal(parseVideoUrl("ep419527")?.epId, 419527);
  assert.equal(parseVideoUrl("ss39104")?.seasonId, 39104);
});

test("parses Bilibili bangumi ep links", () => {
  const parsed = parseVideoUrl(
    "https://www.bilibili.com/bangumi/play/ep419527?theme=movie&from_spmid=666.7.feed.29"
  );
  assert.equal(parsed?.provider, "bilibili");
  assert.equal(parsed?.epId, 419527);
  assert.equal(parsed?.videoId, undefined);
  assert.equal(parsed?.canonicalUrl, "https://www.bilibili.com/bangumi/play/ep419527");
});

test("builds Bilibili embeds for BV and av ids", () => {
  assert.match(buildBilibiliEmbed("BV1xx411c7mD"), /bvid=BV1xx411c7mD/);
  assert.match(buildBilibiliEmbed("av170001"), /aid=170001/);
  assert.match(buildBilibiliEmbed("BV17f4y1n7et", 1, 419527), /ep_id=419527/);
  assert.doesNotMatch(buildBilibiliEmbed("BV17f4y1n7et", 1, 419527), /bvid=/);
});
