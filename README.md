# My proposal

My name is Makhabbat, and I am a sophomore at KAIST doing my Bachelor's degree in Industrial Design (ID: 20240935). For any questions you can contact me at mako1004@kaist.ac.kr.
The URL to the git repository with source code: [Overload](https://github.com/yoondzhy/infinite-runner-multitasking-game) and [video demo](https://youtu.be/vDffRuz51hA).

<!-- I want to make atypical infinite runner game usually made for ADHD children. When I was in China, I had a chance to play ADHD-DTx game made for ADHD children and proven to improve their condition. You can't download or even find information about it outside the research paper, so I wanted to make one for myself, cause I drift a lot and would like to train my attention somehow. 
This is an extreme multitasking game, requiring you to do various things at once and fast.
The game has 5 lanes instead of typical 3, when game starts there will be text presented about which things you have to be collecting - various things will be falling along the game so you will have to hit only the ones you were instructed to at the beginning of the game,  also one in a while you will have to pass through 'gates' and you're supposed to pass through the one that is answer to the question given several seconds before, you also have to gather basic awards along the lanes and avoid basic obstacles.
In the original game that we played, there is an EEG headset that goes along the tablet that records the level of attentiveness to track, however I am thinking it can be just a something that gets reduced when you make too many mistakes. 
I want to make it using three.js, because my reason for taking this course is to eventually be able to use three.js. -->

# Overload: A Multitasking Cognitive Training Game 

Overload is an atypical, **cognitively demanding** _infinite runner_ inspired by digital therapeutics (DTx) designed for children with ADHD.
In Zhejiang University Summer Program, I had the chance to play a clinically tested ADHD-focused game that significantly improved sustained attention, but the **game isn’t publicly available** and information about it exists only inside [research papers](https://pubmed.ncbi.nlm.nih.gov/41490776/).
<!-- 
<img src="./IMG_9134.jpg" width="45%">
<img src="./IMG_9135.jpg" width="45%"> -->

This project is my attempt to recreate that idea for myself — as someone who often drifts and wants a way to actively train attention through gameplay.
The result is an extreme multitasking runner built with three.js, designed to **overload** and strengthen attentional control, working memory, and task-switching.

# Core Concept

Overload is not a typical runner with 3 lanes — it uses 5 lanes, faster pacing(over time), and continuous task switching.
Players must constantly track rules and obstacle avoidance at the same time, rewarding precision and penalizing mind-wandering.

The goal is to maintain cognitive engagement.

# Gameplay Description

1. Five-Lane Movement

    - move between 5 horizontal lanes instead of the standard 3.
    - forces higher spatial attention.

2. Instruction Phase & Target Collecting Game

    At the start of each run:

    - The player is shown a **type of target item they must collect**.
    - Throughout the game, objects fall randomly on the screen.
    - Players must collect only the instructed items and avoid irrelevant ones using a hammer which is essentially just the cursor.
    - There are 5 lives given for target hitting displayed on top left corner, missing or hitting wrong targets leads to losing these lives one by one. However, these lives play no role in hitting obstacles as that is the main game.
    - There is a special booster target that appears every 10 000 points and boosts by double the amount both the general score and earned score from hitting targets for duration of 20 seconds.

    This trains selective attention and working memory

3. Obstacles
    - 2 types of obstacles: small computers that can either be avoided or jumped over and taller claw machines that cannot be jumped over
    - hitting obstacles lead to immediate gameover

# Library Used

Three.js: Used for all 3D rendering, including the world environment, character models, and skeletal animations.

p5.js: Used for the 2D HUD overlay, fruit/target rendering, and the interactive hammer mechanics.

# The Core Organization (MVC Pattern)

<table>
  <tr>
    <td valign="top" width="410">
      <img src="image.png" alt="MVC Diagram" width="400" style="margin-right: 10px;">
    </td>
    <td valign="top">

**The Model (State)**: Managed in `App.svelte` and `GameManager.js`. This holds the "truth" about the game: player health, current score, active target type, and game speed.

**The View (Rendering)**: Split into two layers:

1. **Three.js Layer** (`WorldScene.js`, `ObstacleFactory.js`): Handles the physical 3D world.

2. **p5.js Layer** (`p5overlay.js`): Handles the 2D cognitive task overlay.

**The Controller (Logic)**: Managed in `GameController.js`. It listens for user inputs (A/W/D, arrows, and spacebar) and updates the Model accordingly.

***


To ensure that only a single instance of the game timer (`uTime`), score, and active speed exists at any given time, I implemented a **Singleton approach**. This was also utilized for the `glbCache` to optimize memory management by preventing redundant asset loading. Additionally, I prioritized the use of **Higher-Order Functions** over traditional loops to ensure more declarative code.

  </tr>
</table>

# Key functions and modules
**GameManager.js / GameController.js**
These act as the "Brain."

updatePhysics(): Calculates gravity, jump velocity, and lane-shifting interpolation.

processInteraction(): Determines if a mouse click on a fruit was "Correct" (Target) or "Incorrect" (Penalty).

updateGameFlow(): Manages the transition from the Landing Page to Instructions, and finally to the Game Loop.

ObstacleFactory.js - uses factory to load type of obstacle depending on their chance of appearing(tall ones are rarer)

The UI (HUD, Leaderboard) "observes" the game state. When score or lives change in the JavaScript logic, **Svelte automatically updates** the HTML elements _without the game engine having to manually talk to the DOM_.

In swapCharacter(), we use a Token System. This prevents "race conditions" where two animations (like Running and Jumping) might try to load at the same time and glitch the character. Only the request with the latest "token" is allowed to render.

Since p5.js and Three.js are two different engines, they speak to each other through a Shared State Object(Bridge pattern).

1. p5.js reads state.targetType to know what fruit to draw.

2. Three.js reads state.currentSpeed to know how fast the ground should move.

# Challenges

1. Working with glb file
 This was my first time using a 3D .glb model, so figuring out how to load it, play different animations, and switch between them smoothly took a while. I kept running into random issues with the skeleton and animation states, and it was a lot of trial and error until things finally worked the way I wanted.
2. Infinite world construction and grass
I originally wanted thin, pretty grass that moved nicely with wind. But every version I tried ended up breaking — the grass kept showing weird horizontal lines, especially when I attempted an infinite world where the player stands still and the world generates forward. I even tried using different grass shaders and examples from GitHub, but none of them fixed the glitch.
Eventually I changed the idea: instead of generating an infinite world, I made three ground sections that loop as the player moves. Surprisingly, this not only simplified things but also completely fixed the grass issue.
3. The "Gate test" idea
I also wanted to add a gate section where a question pops up and five gates appear, and the player has to go through the correct one. But adding this meant removing obstacles for a while, updating lives/score logic, and dealing with a bunch of timing issues. After testing, I realized it made the game too complicated and stressful for my friends who tried it, so I decided to keep the game simpler for now.

# Resources Used
As it was hard to start from scratch I used [Commodore 64 by Jason Toff [CC-BY]](https://freefrontend.com/code/procedural-3d-endless-runner-game-2026-02-24/?utm_source=chatgpt.com) to understand how this would be carried out, but eventually ended up changing most of the things. 

I used free 3D models as making some by myseld would take a lot of time:
"Bird in a claw machine" (https://skfb.ly/otMUN) by Tin Pui-yiu is licensed under CC Attribution-NonCommercial-ShareAlike (http://creativecommons.org/licenses/by-nc-sa/4.0/).

Grass taken from https://github.com/DavisHYang/Grass.

Also downloaded the character with animation from [mixamo.com](https://www.mixamo.com/#/?page=2&type=Character) and converted to glb from fbx file.
Overall, I used 4 animations of the main character: dancing(landing page), running, jumping, falling.

The Landing page logo and background were AI generated by Gemini, while the targets were taken from Pinterest where I couldn't find specific owner of paintings.
To carry out this project, I made use of multiple AI agents: mainly google gemini, perplexity for some debugging of stubborn issues and google ai studio for reference. The list of prompts used are presented below. 

<details>
<summary>Click to view AI prompts used</summary>

1. It kinda works but it's just the animation keeps looping in the weirdest unnatural way possible, not like I wanted. Also character is running towards me not the lanes, also when jumping he just disappears.
2. The running model appears perfectly at place, you don't need to change the position! Maybe when he's jumping there are issues but these fixes you are proposing are actually making my runner sink, while jump still doesn't appear. The problem is in jump positions or whatever.
3. Let's just add an animation of the character falling, which is another GLB named "Falling Back Death.glb" and just add that when hit, do the flash effect, give 1-2 seconds before showing the gameover that's it!
4. Copy the grass from here: [https://github.com/DavisHYang/Grass]. Make the grass much much thinner, and only around the lanes not on it, and it also has to move with obstacles to give that illusion that we're running.
5. The grass is not evenly distributed along the entire floor (keep in mind to not go into the lanes). Also there are some lines amidst grass weirdly. Don't add clouds just yet, and you changed the player's position I guess it's off; don't change it nor the scale from the original.
6. The lines are actually gone!! But now the camera moves sides when I change lanes and grass stops generating like it just stops at some point.
7. Can you make the clouds with fuzzy texture instead of those hard 3D edges? And make each clustered with one or two big spheres and a collaboration of smaller ones too.
8. Make the balls smaller, and more balls per cluster, and more lighting on top so there aren't shadows on the clouds. Maybe place clouds a little higher cause it seems too close to the ground.
9. This is how I fixed it: now instead of spheres, let's make the clouds out of clusters of squares.
10. Let's change the entire strategy and make the clouds Minecraft-like, and instead of having horizontal direction make it vertical directed clouds.
11. I don't know how to fix its position because the computer is crooked, 20% in the floor, and I see the back not front.
12. I need A, W, D keyboard to work on the same level as arrows.
13. Now using p5.js we need stuff falling from sky randomly, and a first 3 seconds screen where game shows which ones to collect. The mouse shape should now be a 3D hammer, so I need to find a GLB of a hammer, and around 3 types of things to collect. Only one will be shown and it will need to be collected by pressing, while others also fall but hitting them will result in punishments in attentiveness. If too much wrong ones were hit, attentiveness tanks, making player lose.
14. Let's make the hammer 2D too.
15. Landing page: first of all, the background is gonna be a 3D forest, and on the right there will be our runner, making some pose, and moving all the time (I will need to download some more GLBs). On the left we will do some cool name and big play button, plus a small description of the game.
16. Why can't I see my GLB here?
17. I also don't even see the OVERLOAD logo, and yes, the GLB is nowhere to be seen. For some reason the "NeuroRunner Ready to Focus" window is also here. The background is not grass at all, it's just blue.
18. Add overload_trans.png image to the code, on top of the button, and give it some movement (just some wiggling 2D is enough).
19. Can you bring back the instructions (only what type of targets they have to collect) that appear for a few seconds in the beginning?
20. Now we have to make speed progressive, like it starts slow at first but then it gets faster, but at some point it can't get faster than that cause that would've been chaotic right.
21. My obstacles disappeared after I reached around 4000 in scores.
22. The hearts have to decrease when you hit the wrong target and when you miss the right ones as well, and when hearts die just make them grey and when you're out of hearts you die.
23. It keeps making me die at random spots when the hearts aren't even over. Heart greying out is not working it just disappears. Should we just remove whatever that attentiveness meter was?
24. Why didn't my score update when i got a higher score later?
25. Can you please show the parts that I have to fix?
26. How do I clear the leaderboard now? I have 3 duplicate entries, I can't check if the new logic works or not.
27. Add gates like in the image I attached—they're kinda an opaque surface to go through with answers shown. So about every 5000 score, 5 gates appear on 5 lanes. Before they appear the question will appear in the top center, and before and during the gates' appearance, all obstacles disappear for some time so the player can go through the gate with the right answer without stumbling upon an obstacle.
28. Gates are not moving with the world/ground so I can't go through them at all and I don't even see the mission text on top. The obstacles are still there.
29. We add sun with clouds, adjust the lighting and then after 7k score smooth change to moon and dark sky and adjust lighting accordingly as well.
30. Make the moon and sun not perfectly round but low-poly textured round. Also at night add lighting from the camera's standpoint because it gets too dark.
31. Let's make a visual representation of that next score as yellow and bigger +100.
32. I have an issue... the page before game starts for 3 seconds to show the target? It can't be seen when first entered through the landing page because countdown counts from the time screen loads not from when you pressed play and entered the page. But when you press retry it appears properly.
33. List of improvements we will be implementing: showing on the side which fruit we are collecting so we always know without forgetting; add more types of obstacles so staying on one line throughout the whole game is impossible; maybe changing environments from time to time like adding a city or something; adding golden limited edition fruits falling that will pass quickly but for example boost your scores by 2 for some time. Let's start with adding one more type of obstacle that is bigger than existing computer, any suggestions?
34. New obstacle has to be about 4 times rarer than the main computer obstacle.
35. These proportions worked, but I still can jump through the claw machine, which I don't want to be possible.
36. When I was in star multiplier mode, the score from hitting the right target still was 100.
37. I don't know what I did but now when I hit the right target all floating images freeze and hammer disappears.
</details>



<!-- ![alt text](image.png) -->

