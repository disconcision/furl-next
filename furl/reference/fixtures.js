/* Preset programs and samples; these are not a language evaluator. */
function createFurlFixtures() {
 const A=(text,v='',id='')=>({kind:'atom',text,v,id});
 const D=(name,exp)=>({name,exp});
 const S=(id,kind,defs,out,params=[],v='')=>({id,kind,defs,out,params,v});
 const M=(id,scrut,branches,v='')=>({id,kind:'match',scrut,branches,v});
 const P=(name,v)=>({name,v});
 const B=(pat,defs,out,active,matched='')=>({pat,defs,out,active,matched});
 const callFrames=[
  {id:'c0',parent:null,child:'c1',args:'[2,4,6]',value:'12'},
  {id:'c1',parent:'c0',child:'c2',args:'[4,6]',value:'10'},
  {id:'c2',parent:'c1',child:'c3',args:'[6]',value:'6'},
  {id:'c3',parent:'c2',child:null,args:'[]',value:'0'}
 ];
 const callById=new Map(callFrames.map(c=>[c.id,c]));
 const sumV=Object.fromEntries(callFrames.map(c=>[c.id,c.value]));
 function squared(id,dx='dx',dy='dy') {
  return S(id,'let',[D(dx,A('x2 - x1','3')),D(dy,A('y2 - y1','4')),D('sx',A(dx+' * '+dx,'9')),D('sy',A(dy+' * '+dy,'16'))],A('sx + sy','25'));
 }
 const radius=S('radius','let',[D('(x1, y1)',A('center','(0, 0)')),D('(x2, y2)',A('p','(3, 4)')),D('d2',squared('squared'))],A('sqrt d2','5'));
 const letRoot=S('let-root','let',[D('center',A('(0, 0)','(0, 0)')),D('p',A('(3, 4)','(3, 4)')),D('r',radius)],A('circle center r','circle (0,0) 5'));
 const apply=S('apply-fun','fun',[D('product',A('factor * x','12'))],A('product + 1','13'),[P('x','4')],'<function>');
 const scale=S('scale-fun','fun',[D('apply',apply)],A('apply 4','13'),[P('factor','3')],'<function>');
 const functionRoot=S('function-root','let',[D('scale',scale)],A('scale 3','13'));
 const matchExpr=M('plain-match','input',[
  B('Some n',[D('next',A('n + 1','8'))],A('string_of_int next','"8"'),'some','Some 7'),
  B('None',[],A('"auto"','"auto"'),'none','None')
 ]);
 const matchRoot=S('match-root','let',[D('input',A('Some 7',{some:'Some 7',none:'None'},'match-input'))],matchExpr);
 const combinedMatch=M('format-match','opt',[
  B('Some n',[D('next',A('n + 1','8')),D('text',A('string_of_int next','"8"'))],A('text ^ suffix','"8 px"'),'some','Some 7'),
  B('None',[],A('"auto"','"auto"'),'none','None')
 ]);
 const format=S('format-fun','fun',[D('suffix',A('" " ^ unit','" px"'))],combinedMatch,[P('unit','"px"'),P('opt',{some:'Some 7',none:'None'})],'<function>');
 const combinedRoot=S('combined-root','let',[D('format',format)],A('format "px" (Some 7)',{some:'"8 px"',none:'"auto"'},'format-call'));
 const sumMatch=M('sum-match','xs',[
  B('[]',[],A('0','0'),'c3','[]'),
  B('x :: rest',[D('subtotal',A('sum rest',Object.fromEntries(callFrames.filter(c=>c.child).map(c=>[c.id,callById.get(c.child).value])),'recursive-step'))],A('x + subtotal',sumV),['c0','c1','c2'],{c0:'2::[4,6]',c1:'4::[6]',c2:'6::[]'})
 ]);
 const sum=S('sum-fun','fun',[],sumMatch,[P('xs',Object.fromEntries(callFrames.map(c=>[c.id,c.args])))],'<function>');
 const recursionRoot=S('recursion-root','let',[D('sum',sum)],A('sum [2,4,6]','12','run-answer'));
 recursionRoot.defs[0].recursive=true;
 const calculation=[D('(x1, y1)',A('center','(0, 0)')),D('(x2, y2)',A('p','(3, 4)')),D('dx',A('x2 - x1','3')),D('dy',A('y2 - y1','4')),D('sx',A('dx * dx','9')),D('sy',A('dy * dy','16')),D('d2',A('sx + sy','25')),D('r',A('sqrt d2','5'))];
 const throughBefore=S('through-before','fun',calculation,A('circle center r','circle (0,0) 5'),[P('center','(0, 0)'),P('p','(3, 4)')],'<function>');
 const dist=S('dist-fun','fun',[D('(x1, y1)',A('p1','(0, 0)')),D('(x2, y2)',A('p2','(3, 4)')),...calculation.slice(2,-1)],A('sqrt d2','5'),[P('p1','(0, 0)'),P('p2','(3, 4)')],'<function>');
 const throughAfter=S('through-after','fun',[D('r',A('dist center p','5'))],A('circle center r','circle (0,0) 5'),[P('center','(0, 0)'),P('p','(3, 4)')],'<function>');
 const helperBefore=S('helper-before','let',[D('through',throughBefore)],A('through (0,0) (3,4)','circle (0,0) 5'));
 const helperAfter=S('helper-after','let',[D('dist',dist),D('through',throughAfter)],A('through (0,0) (3,4)','circle (0,0) 5'));
 const traceFormat=structuredClone(format);
 function prefixIds(n){if(n.id)n.id='trace-'+n.id;if(n.defs)n.defs.forEach(d=>prefixIds(d.exp));if(n.out)prefixIds(n.out);if(n.branches)n.branches.forEach(b=>{b.defs.forEach(d=>prefixIds(d.exp));prefixIds(b.out);});}prefixIds(traceFormat);
 const studies={
  lets:{node:letRoot,name:'shape',file:'geometry / radius'},
  functions:{node:functionRoot,name:'answer',file:'functions / scale'},
  matches:{node:matchRoot,name:'label',file:'options / label'},
  combined:{node:combinedRoot,name:'label',file:'options / format'},
  recursion:{node:recursionRoot,name:'answer',file:'lists / sum'},
  traces:{node:traceFormat,name:'format',file:'options / format · two calls'},
  helper:{node:helperBefore,name:'shape',file:'geometry / through'}
 };
 return {studies,helperBefore,helperAfter,callFrames,callById};
}
