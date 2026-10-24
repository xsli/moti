import {test} from 'node:test';
import assert from 'node:assert/strict';
import {splitInlineFigures, inlineFigureImage} from './inline-figures.ts';
import {stemSectionsWithFigures} from './subproblems.ts';

test('inline references retain text and resolve only stored image payloads',()=>{
  assert.deepEqual(splitInlineFigures('前\n![图1](figure:gk-img-1)\n后'),[
    {type:'text',value:'前\n'},{type:'figure',id:'gk-img-1',alt:'图1'},{type:'text',value:'\n后'}
  ]);
  assert.equal(splitInlineFigures('![图](https://example.com/x.png)')[0].type,'text');
  const base={id:'f',title:'图',caption:'',svg:''};
  assert.equal(inlineFigureImage([{...base,image:'https://example.com/x.png'}],'f'),undefined);
  assert.equal(inlineFigureImage([{...base,image:'data:image/png;base64,AA=='}],'f'),'data:image/png;base64,AA==');
  assert.equal(inlineFigureImage([],'f'),undefined);
});
test('inline solution figures never fall into the trailing question gallery',()=>{
  const f={id:'solution',title:'解析图',caption:'',svg:'',inline:true};
  const normal={id:'question',title:'题图',caption:'',svg:''};
  const result=stemSectionsWithFigures('题目',[f,normal]);
  assert.deepEqual(result.trailingFigures,[normal]);
});
