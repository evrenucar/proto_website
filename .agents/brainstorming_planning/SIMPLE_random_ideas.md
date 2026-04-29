# Random Ideas

- **Rich markdown**: Add code blocks, formulas, mermaid graphs and tables to markdown.
- **Cursor emotes**: Cursor with emotes. With certain shortcuts or while doing certain things cursors should be able to do emotes, cool movements, animations, etc.
- **Project metadata as a separate branch**: Project metadata is stored in a separate branch so you can easily move it to any instance and can be even terminal accessible (ssh). Reference: https://youtu.be/9YjWGXi5tDw?si=KvKJhgY_VpzHN0CA
- **photo cropping**: If you double click on a photo it will go into crop mode. Should be able to move all 4 corners to be able to crop the image either by clicking away or pressing enter. The parts being cropped should be still visible but less dim. ESC results in cancelled crop. Crop only becomes the view side. The original image is stored uncropped. This might result in privacy issues if it was cropped intentionally. for a cropped image if you double click you should be able to get the same overlay again that you saw during cropping and save in the same way. Now sure what is the best way to store the cropping information
- **add snapping alignment and distribution behavior**: snapping behavior first. Edges of elements as well as centers of elements should be able to snap
- **add alt and shift dragging behavior**: make sure that you are able to alt drag to duplicate. ANd shift drag to move it along an axis

- would be cool to be able to have themes for the whole thing. Just like obsidian does!

- sharable templates like in obsidian and miro

--------WORKING ON THIS------------





-----NEXT THINGS TO WORK ON--------



just continue with making the tests work just like said in C:\Users\evren\Documents\GitHub\proto_website\.agents\reviews_and_feedback\gpt_review_20260429_032501.md

afterwards can focus on a few essential features I wrote down

add ctrl+D for duplication and multiplication

add rotation of elements

make linked board nodes and other bookmarks not overflow ith their content

implement performance audit testing and benchmark structure procedure. (standard board. panning around recording fps recording board load time when cache empty)

implement muti touch/ mobile testing 

implement easy sharing between people

clarify export import open and stress test them

make it possible to upload video files inside!

element above an dbelow

markdown saving export etc.

enable resizing multiple elements at the same time

implement remove background

-----------NAVIGATION-----------
woud be nice to be able to move around with arrows for panning. single click could be small linear movements. holding down could move smoothly with constant speed. holding shift would increase the length of the small linear movements as well as the speed of moving down smoothly. comibined input should also be possibel where you move cross direction




-----------NEW NODES and Node things--------------
download youtube video
download pdf
embedded mp4 video with preview and export/save
embedded audio with preview and export/save


---YOUTUBE-------------------
would be possible to see comments?

how to embed the regular youtube browsing interface

could save youtube watch time if you click a button. Defaults to regular timestamp

Maybe if you go through youtube share where it embeds user data. By default when pasting that user data could be stripped!

at the end of a video there are recommendations appearing. When I click it a new embed should be opened towards the right side of the current youtube view at the same scale




---INSANE IDEAS
-make it possible to edit videos inside
-make it possible to have connected nodes just like in obsidian canvas
-make it possible to leave audio notes.
-make it so you can leave an audio note then click a button to transcribe it
-ADD cli inside the page
-MAke a debug mode where all info is shown. Maybe add a terminal / console inside the board






----COMPLETED--------------------------------------

The website asks permisions when in canvas website (not great we could do this later but for now when stuff is not secure its a bad idea). Disabled by stripping the iframe `allow=` attribute on embeds. See `.agents/feature_implementation/embed-iframe-permissions.md` for the spec when we want to bring this back safely.

If I click on an embedded youtube video to start it in chrome the youtube window gets stuck to my cursor almost as if im holding down m1. Same behavior doesn't happen in firefox. reproduce it, Find the cause, fix it, test and confirm its fixed
 
when I add text by clicking t and then clicking somewhere the text box should be added at my    cursor. with the top left of the text box being where my cursor is and the tet box being fix this!








-------------HOW TO GET THINGS WORKING-----------
give this to codex first. Output give to opus

 Be Precise in what you want.
–
Be explicit about: the language and framework, the style or pattern expected, the tests or acceptance criteria, and, critically, what the model should NOT do.
instead of: "write a function to parse dates." try: "write a python function using dateutil that parses iso 8601 and us date formats, raises valueerror on ambiguous input, never falls back to today's date."
the second one takes twenty extra seconds to write. it saves you fifty dollars in token waste and three iterations.
–
Step-by-step plan in the system prompt
stop criteria defined ("stop when tests pass" beats "stop when done")
fallbacks defined ("if you can't find x, return y, don't guess")
–
Pre-structure your documents with clear anchors. tell the model which sections to prioritize. require citations in the instructions, not just the output format. 4.7's self-verification will silently downweight shaky sources if you let it, make that explicit instead of hoping.
—
Make sure you have a test embedded at each stage that can verify accuracy and completeness. 

Verification looks different depending on the task. For backend work, make sure agent knows how to start up your server/service to test it end to end; for frontend work, use the proper tool to give agent a way to control your browser; for desktop apps, use computer use. 