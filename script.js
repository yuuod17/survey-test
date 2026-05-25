const questions=[

{

question:"어떤 것이 더 끌리시나요?-1",

top:"선택 1",

bottom:"선택 2"

},

{

question:"어떤 것이 더 끌리시나요?-2",

top:"선택 1",

bottom:"선택 2"

}

];

let current=0;

function showQuestion(){

document.getElementById(
"question"
).innerText=
questions[current].question;

document.querySelectorAll(
"button"
)[0].innerText=
questions[current].top;

document.querySelectorAll(
"button"
)[1].innerText=
questions[current].bottom;

document.getElementById(
"progress"
).innerText=
`${current+1}/${questions.length}`;

}

function choose(){

current++;

if(current>=questions.length){

document.body.innerHTML=
"<h1>완료!</h1>";

return;

}

showQuestion();

}

showQuestion();