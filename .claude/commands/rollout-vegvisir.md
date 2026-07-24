Execute the Vegvísir rollout. Everything is pre-staged and verified (349 tests pass on the branch); your job is to ship it in order, verifying each step before the next. Report progress as you go. If any step fails, stop and explain — do not improvise around failures.

## Context

The app "Where Am I" is being renamed to "Vegvísir". Branch `rebrand/vegvisir` contains the complete staged rename: app name, all 5 in-app locales + slogans, new icon set + splash (gold Vegvísir stave), version 1.4.0, and Play listing texts in 5 locales (en-US, no-NO, is-IS, plus NEW da-DK and sv-SE). The landing site rename is staged on branch `claude/connection-status-check-berruy` in the sassagold-landing repo. Package ID stays `com.sassagold.whereami`. versionCode is EAS-remote with autoIncrement — do not set it manually.

## Steps

1. **Preflight**: `git fetch origin`. Confirm working tree is clean and `origin/rebrand/vegvisir` exists. Run `npm ci`.

2. **Merge**: merge `rebrand/vegvisir` into `master` (no-ff), then run `npm run typecheck` and `npm test`. Both must pass before pushing. Push master.

3. **Build**: `eas build --platform android --profile production`. Wait for it to finish (~15 min). It must use the EAS-stored keystore (remote credentials — this repo has always used them).

4. **Submit**: `eas submit --platform android --latest`. If it asks for a Google Service Account key, use the JSON key for `play-puplisher@sassagold-apps.iam.gserviceaccount.com` (ask the user where the file is if not found).

5. **Play listing** (renames the store pages + creates the new Danish/Swedish ones + attaches 1.4.0 release notes in all five languages):
   ```
   node scripts/push-play-listing.js --key <path-to-service-account.json> --notes-version 1.4.0
   ```
   Run with `--dry-run` first and show the user the length report before the real push.

6. **App icon on Play**: the Play Console "App icon" in the main store listing is taken from the uploaded AAB automatically; the listing graphics (feature graphic etc.) can stay for now — localized Vegvísir store graphics are a follow-up task, not part of tonight.

7. **Website**: in the sassagold-landing repo (`c:/Users/leand/sassagold-landing` or wherever it is checked out): `git fetch origin`, merge `origin/claude/connection-status-check-berruy` into `main`, push. This flips all 535 "Where Am I" mentions to Vegvísir with a "formerly known as" line on the product pages.

8. **Verify & report**: confirm the build is FINISHED and submitted, the listing edit COMMITTED, and the site pushed. Summarize what's now in Google review vs. already live.

## Notes

- The cloud Claude session can do steps 3–5 instead if EAS/keys are missing on this machine — the user can just tell it "go".
- After everything ships: remind the user to rotate the Expo token and the Play service-account key, and to store fresh ones as environment variables.
