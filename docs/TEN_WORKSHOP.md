# Math Lab : du calcul de base aux courbes et surfaces

## Scope and navigation

Local implementation based on main 3137195740120bdde4a3604a9d9e81ab9e7d25ba (Math Lab page PR136 and shared VR PR135 included). No push, merge or deployment is part of this work. The earlier theme prototype cb83f4c remains intact in its separate worktree.

One Math Lab page and identity, with a shared level selector:

- **Nombres et calculs**, /math-lab.html?level=numbers: interactive 3D Les amis de10, discovery, complements and subtraction.
- **Courbes et surfaces**, /math-lab.html?level=functions: the preserved advanced formula page, tangent/area readouts and3D surfaces.
- The default /math-lab.html still opens functions for existing links. Both levels share a navigation component and preserve the current advanced block in the fragment while switching. Number progress resumes locally.
- Centre > Ateliers links to Math Lab's number level; Browse keeps its existing Math Lab entry. These are levels of the same product, not separate workshops to choose between.
- Each level loads only its own renderer adapter. The beginner implementation files remain named ten-workshop-* for collision-free internals. No simultaneous second host or renderer is mounted. Existing seasonal artwork is retained without a new artistic pipeline.

## Run locally on UGBrutal

Run npm run build, then npm run preview:ten-workshop. Open http://127.0.0.1:4198/math-lab.html?level=numbers on that PC. The server binds only the loopback interface, not the LAN or internet. No asset store, relay, credential or public service is opened. Port4196 belongs to the previous prototype and is not replaced.

## Complete screen activity

1. Discover: ten stable objects, each worth1. Select an object then A/B using keyboard or pointer, or drag it across the 3D table. Preview moves no arithmetic until a valid release. Escape, blur, hidden document and context changes cancel the gesture. Undo restores the assignment. Zero is a valid empty group.
2. Practice **Completer10**: a + ? =10. Practice **Soustraire de10**:10 - a = ?. Each mode covers all11 answers0 through10 in a varied order, including the requested10 -7 = ?.
3. The two practice progressions are independent. Switching preserves both; restart resets only the selected operation. Discovery and appearance are retained. Modelv2 strictly migrates valid prototypev1 saves, preserving complement progress and leaving subtraction fresh.
4. Both types of calculation accept the HTML number field, large HTML keypad and enlarged 3D calculator. Empty or malformed values are refused; a wrong answer permits retry; repeated validation cannot add another success. No timer or dexterity score.
5. Before a requested hint, groupB and its quantity are absent from the practice picture and hint text. In subtraction, groupA contains the objects put aside, with a dark slash as well as colour. A requested hint reveals the remainingB objects and equivalent text. Removed plus remaining still totals10.
6. Optional themes stay secondary. Their existing local save/reuse and editor snapshot workflows are unchanged. A scene snapshot does not recreate activity logic in the editor.

## PC and Quest acceptance

**PC is the primary complete activity.** Test keyboard-only selection and targets, drag cancellation,0 and10,10 -7, wrong answer/retry/hint, switching practice type, reload, and replay. Screen and phone layouts are covered by automated browser journeys; manual screen-reader and child usability studies are not claimed.

**Quest is deferred, adult testing only if the owner wishes.** The number workshop does not expose an immersive-VR entry. The existing separate /?app=vr-lab remains available in the project but is not this arithmetic activity. A synthetic XR regression verifies existing browser lifecycle/input contracts, not physical tracking, reach, comfort or headset performance. This local loopback URL is not a Quest network link. Do not disable HTTPS checks, browser security, age requirements or headset guardian boundaries to make it work. A future headset trial needs an authorized accessible HTTPS preview and an actual adult tester before any immersive-activity claim. No deployment or LAN exposure was made here.

Follow the specific headset manufacturer's current supported-age and supervised-account rules. This build is not validation for children below the supported age. No child headset test was performed or requested by this implementation.

## Architecture and limitations

- ten-workshop-model.ts is pure and immutable. Presentation cannot change rules, identities or saved arithmetic.
- ten-workshop-scene.ts composes canonical GraphysX scenes with one host, no alternate renderer loop or physics rules.
- ten-workshop-theme.ts remains a bounded garden prototype, not a universal theme standard. Original code primitives only; no purchased or third-party assets were added.
- Custom palette contrast is not certified. Use default palettes for first testing. No formal accessibility certification or manual assistive-technology session.
- Browser-local saves only, no accounts or cloud upload. No multi-tab conflict resolution or pupil profiles. Browser data removal loses local sessions; no synchronization betweenPC andQuest.
- Scored practice covers only complements and subtraction from10, not a general0-20 curriculum. Explorer separately offers counting to100 and unscored additions to20.
- Existing editor asset import limitations remain: direct droppedGLB/FBX/OBJ not converted, partial model materials, no complete userHDR/EXR or boughtPBR workflow. Assets may be publicly served; no private proof of purchase belongs in runtime metadata.

## Evidence

Use the final local receipt and logs under output/ten-workshop. The named smoke ten-workshop covers the new activity; math-lab continues to cover the advanced level. verify-ten-workshop-browser.mjs serializes five targeted browser journeys under the same machine lock and explicitly does not replace a full release gate. Record passed, failed and unrun checks separately. Physical Quest acceptance is always unrun until an actual headset trial.


## Unified curriculum follow-up

This isolated copy also includes counting to 100 and addition exploration to 20 in the same 3D table. See MATH_LAB_UNIFIED.md for provenance, routing, state, limits and the separate preview. The prior prototype remains untouched on port 4197.
