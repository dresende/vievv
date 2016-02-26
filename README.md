## Vievv

### Install

```sh
npm i vievv
```

### Design

It's similar to EJS v1, but with a little twist to my needs, specially the resolver for including other views.

```html
<div>
    Hello, I'm <%= name %>.
</div>
```

### Methods

#### Compile

```
var view     = require("vievv");
var template = view.compile(filename[, options ]);

console.log(template(scope));
```

#### Render

```
var view = require("vievv");

console.log(view.render(data[, options ]));
```
