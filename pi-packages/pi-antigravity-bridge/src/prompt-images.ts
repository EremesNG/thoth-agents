// The stream-json CLI accepts text-only prompts. Stage images for the Pi read
// tool instead; ACP sends native image blocks and does not use this module.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const STAGE_DIR_PREFIX = "pi-bridge-img-";
export const STAGE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const EXT_BY_MIME: Record<string, string> = {
	"image/png": ".png",
	"image/jpeg": ".jpg",
	"image/gif": ".gif",
	"image/webp": ".webp",
	"image/bmp": ".bmp",
};

function sweepStale(root: string): void {
	let entries: string[];
	try { entries = fs.readdirSync(root); }
	catch { return; }
	const cutoff = Date.now() - STAGE_MAX_AGE_MS;
	for (const entry of entries) {
		if (!entry.startsWith(STAGE_DIR_PREFIX)) continue;
		try {
			const full = path.join(root, entry);
			// Never follow a prefixed symlink/junction in the shared temp root.
			// rm removes nested links themselves, not their targets.
			const stat = fs.lstatSync(full);
			if (stat.isDirectory() && !stat.isSymbolicLink() && stat.mtimeMs < cutoff) {
				fs.rmSync(full, { recursive: true, force: true });
			}
		} catch { /* Best effort: another process may be staging or sweeping. */ }
	}
}

/** Returns null on failure, after best-effort cleanup of any partial stage. */
export function stagePromptImages(
	images: Array<{ data: string; mimeType: string }>,
	root = os.tmpdir(),
): { dir: string; paths: string[] } | null {
	let dir: string | undefined;
	try {
		sweepStale(root);
		const stageDir = fs.mkdtempSync(path.join(root, STAGE_DIR_PREFIX));
		dir = stageDir;
		const paths = images.map((image, i) => {
			const bytes = Buffer.from(image.data, "base64");
			if (bytes.length === 0) throw new Error("empty image payload");
			const ext = Object.hasOwn(EXT_BY_MIME, image.mimeType) ? EXT_BY_MIME[image.mimeType] : ".bin";
			const file = path.join(stageDir, `image-${i + 1}${ext}`);
			fs.writeFileSync(file, bytes, { mode: 0o600 });
			return file;
		});
		return { dir: stageDir, paths };
	} catch {
		if (dir) {
			try { fs.rmSync(dir, { recursive: true, force: true }); }
			catch { /* A later sweep can retry cleanup. */ }
		}
		return null;
	}
}

export function buildImageNote(paths: string[]): string {
	return `[The user attached ${paths.length} image(s) to this message. They are staged at:\n${paths.map(file => `- ${file}`).join("\n")}\nView them by calling the pi read tool on these exact paths; the image content is delivered to you directly.]`;
}
