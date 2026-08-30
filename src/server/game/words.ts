const WORDS = `
airplane|alarm clock|alligator|anchor|angel|ant|apple|apron|aquarium|armchair|arrow|astronaut
backpack|balloon|banana|barn|basket|bat|bathtub|beach|bear|beaver|bed|bee|bell|bicycle|bird|birthday cake|boat|book|boot|bottle|bowling|box|brain|bread|bridge|broom|bucket|butterfly|button
cactus|camera|campfire|candle|candy|canoe|car|carrot|castle|cat|caterpillar|cave|chair|cheese|cherry|chicken|chimney|clock|cloud|clown|coat|coconut|computer|cookie|corn|cow|crab|crown|cup|cupcake
deer|diamond|dinosaur|dog|dolphin|donut|door|dragon|drum|duck
eagle|ear|earth|egg|elephant|envelope|eye
factory|fan|feather|fence|fire|fire truck|fish|flag|flashlight|flower|football|fork|fox|frog
garden|ghost|giraffe|glasses|globe|goat|grapes|guitar
hamburger|hammer|hand|hat|heart|helicopter|hippo|horse|hot dog|house
ice cream|igloo|island
jacket|jellyfish|kangaroo|key|keyboard|kite|kiwi|ladder|lamp|leaf|lemon|lighthouse|lion|lollipop
magnet|mailbox|map|mermaid|microphone|mirror|monkey|moon|motorcycle|mountain|mouse|mushroom
nest|newspaper|nose|octopus|onion|orange|owl
paintbrush|palm tree|panda|pants|parachute|parrot|peach|peacock|pear|pen|pencil|penguin|piano|pig|pineapple|pirate|pizza|planet|plate|police car|popcorn|potato|pumpkin|purse
rabbit|rainbow|refrigerator|ring|river|robot|rocket|roller skate|rooster
sailboat|sandwich|scarecrow|scissors|seahorse|shark|sheep|shell|ship|shoe|skateboard|skull|snail|snake|snowflake|snowman|sock|spider|spoon|star|strawberry|submarine|sun|sunglasses|swan|sweater|sword
table|taco|telephone|television|tent|tiger|toaster|toilet|tomato|tooth|toothbrush|tractor|traffic light|train|tree|trophy|truck|turtle
umbrella|unicorn|vacuum|violin|volcano|waffle|watch|watermelon|whale|wheel|windmill|window|wizard|zebra
acorn|ambulance|antelope|axe|badger|bagel|barbecue|baseball|basketball|beehive|belt|bench|binoculars|blackboard|blender|blueberry|boomerang|bow tie|broccoli|bus|cabinet|camel|camping|cannon|captain|castle tower|celery|cheetah|chess|chopsticks|clam|compass|couch|crayon|crocodile|daisy|desk|dice|diving board|dream|drill|elevator|escalator|fairy|ferris wheel|fireplace|flamingo|flute|fountain|gift|gingerbread man|golf club|gorilla|hairbrush|hammock|harmonica|hedgehog|hockey stick|honey|hose|hourglass|iceberg|jellybean|juice|kettle|koala|ladybug|lawn mower|leopard|lobster|magic wand|mango|medal|mitten|moose|mop|mosquito|muffin|nail|necklace|needle|notebook|ocean|ostrich|paint can|pancake|paper clip|pear|pelican|pepper|picnic|pillow|pinwheel|pocket|porcupine|pretzel|queen|raccoon|radio|raincoat|rake|rhino|road|sandcastle|satellite|school bus|seal|shopping cart|skunk|sled|slipper|soap|soccer ball|spaceship|stapler|stop sign|suitcase|teapot|telescope|tennis racket|thermometer|throne|tornado|traffic cone|trampoline|treasure chest|trombone|tulip|turkey|vase|vest|wallet|watering can|wheelbarrow|whistle|worm|yacht|yo-yo
`.trim().split(/\s*\|\s*|\r?\n+/u).filter(Boolean);

export const WORD_BANK = [...new Set(WORDS)];

export function pickWordChoices(bank: readonly string[] = WORD_BANK, random: () => number = Math.random): string[] {
  if (bank.length < 3) throw new Error('Word bank must contain at least three words.');
  const pool = [...new Set(bank)];
  if (pool.length < 3) throw new Error('Word bank must contain at least three unique words.');
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.min(index, Math.floor(random() * (index + 1)));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }
  return pool.slice(0, 3);
}
